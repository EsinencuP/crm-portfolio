import { z } from "zod";

import {
  accessibleConversation,
  canWriteConversation,
  channelSelect,
  messagingActor,
  messagingHeaders,
} from "@/lib/messaging/access";
import { canAccess, isWorkspaceAdmin } from "@/lib/permissions";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const changes = z
  .strictObject({
    assignedToId: z.string().min(1).max(128).nullable().optional(),
    status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
    contactId: z.string().min(1).max(128).nullable().optional(),
    readIds: z.array(z.string().min(1).max(128)).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function GET(_request: Request, { params }: Context) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const conversation = await accessibleConversation((await params).id, actor.member);
  if (!conversation)
    return Response.json({ error: "Conversation not found." }, { status: 404, headers: messagingHeaders });
  const result = await prisma.messagingConversation.findUniqueOrThrow({
    where: { id: conversation.id },
    include: {
      channel: { select: channelSelect },
      contact: { select: { id: true, firstName: true, lastName: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  return Response.json(
    { ...result, canWrite: await canWriteConversation(actor.member, conversation) },
    { headers: messagingHeaders },
  );
}
export async function PATCH(request: Request, { params }: Context) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const parsed = changes.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid conversation changes." }, { status: 400, headers: messagingHeaders });
  const conversation = await accessibleConversation((await params).id, actor.member);
  if (!conversation)
    return Response.json({ error: "Conversation not found." }, { status: 404, headers: messagingHeaders });
  const { readIds, ...data } = parsed.data;
  if (Object.keys(data).length && !(await canWriteConversation(actor.member, conversation)))
    return Response.json({ error: "Edit access required." }, { status: 403, headers: messagingHeaders });
  if (data.contactId !== undefined && !isWorkspaceAdmin(actor.member.role))
    return Response.json(
      { error: "Only administrators can change a conversation's contact link." },
      { status: 403, headers: messagingHeaders },
    );
  if (data.contactId && !(await canAccess(actor.member.userId, "Contact", data.contactId, "EDIT")))
    return Response.json({ error: "Contact not accessible." }, { status: 403, headers: messagingHeaders });
  const targetId = data.assignedToId === undefined ? conversation.assignedToId : data.assignedToId;
  if ((data.assignedToId !== undefined || data.contactId !== undefined) && targetId) {
    const target = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: targetId,
          workspaceId: actor.member.workspaceId,
        },
      },
    });
    if (!target || target.role === "VIEWER")
      return Response.json(
        { error: "Choose an active workspace team member." },
        { status: 400, headers: messagingHeaders },
      );
    const contactId = data.contactId === undefined ? conversation.contactId : data.contactId;
    if (contactId && !isWorkspaceAdmin(target.role)) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactId, workspaceId: actor.member.workspaceId },
      });
      const grant = await prisma.recordPermission.findUnique({
        where: {
          workspaceId_entityType_entityId_userId: {
            workspaceId: actor.member.workspaceId,
            entityType: "Contact",
            entityId: contactId,
            userId: target.userId,
          },
        },
      });
      if (contact?.ownerId !== target.userId && !["EDIT", "FULL"].includes(grant?.permission ?? "NONE"))
        return Response.json(
          { error: "Assignee needs edit access to this contact." },
          { status: 403, headers: messagingHeaders },
        );
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.messagingConversation.update({
      where: { id: conversation.id },
      data: { ...data, unreadCount: { increment: 0 } },
    });
    if (readIds?.length) {
      await tx.messagingMessage.updateMany({
        where: { conversationId: conversation.id, id: { in: readIds }, direction: "INBOUND", readAt: null },
        data: { readAt: new Date(), status: "READ" },
      });
      const unreadCount = await tx.messagingMessage.count({
        where: { conversationId: conversation.id, direction: "INBOUND", readAt: null },
      });
      await tx.messagingConversation.update({ where: { id: conversation.id }, data: { unreadCount } });
    }
  });
  return Response.json({ success: true }, { headers: messagingHeaders });
}
