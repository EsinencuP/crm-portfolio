import { z } from "zod";

import { channelSelect, conversationAccessWhere, messagingActor, messagingHeaders } from "@/lib/messaging/access";
import { isWorkspaceAdmin } from "@/lib/permissions";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
const filter = z.object({
  platform: z.enum(["WHATSAPP", "TELEGRAM"]).optional(),
  status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional(),
  assignedToId: z.string().max(128).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export async function GET(request: Request) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const parsed = filter.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json({ error: "Invalid conversation filters." }, { status: 400, headers: messagingHeaders });
  const { page, limit, platform, status, assignedToId, search } = parsed.data;
  const where = {
    AND: [
      await conversationAccessWhere(actor.member),
      {
        ...(platform && { channel: { platform } }),
        ...(status && { status }),
        ...(assignedToId && { assignedToId: assignedToId === "unassigned" ? null : assignedToId }),
        ...(search && {
          OR: [
            { displayName: { contains: search, mode: "insensitive" as const } },
            { externalId: { contains: search } },
            { contact: { firstName: { contains: search, mode: "insensitive" as const } } },
            { contact: { lastName: { contains: search, mode: "insensitive" as const } } },
          ],
        }),
      },
    ],
  };
  const [items, total] = await Promise.all([
    prisma.messagingConversation.findMany({
      where,
      include: {
        channel: { select: channelSelect },
        contact: { select: { id: true, firstName: true, lastName: true, ownerId: true } },
        assignedTo: { select: { id: true, name: true } },
        messages: { orderBy: [{ sentAt: "desc" }, { id: "desc" }], take: 1 },
      },
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.messagingConversation.count({ where }),
  ]);
  const grants =
    !isWorkspaceAdmin(actor.member.role) && actor.member.role !== "VIEWER"
      ? await prisma.recordPermission.findMany({
          where: {
            workspaceId: actor.member.workspaceId,
            userId: actor.member.userId,
            entityType: "Contact",
            entityId: { in: items.flatMap((item) => (item.contactId ? [item.contactId] : [])) },
            permission: { in: ["EDIT", "FULL"] },
          },
          select: { entityId: true },
        })
      : [];
  const editable = new Set(grants.map((grant) => grant.entityId));
  const conversations = items.map(({ messages, ...conversation }) => ({
    ...conversation,
    lastMessage: messages[0] ?? null,
    canWrite:
      actor.member.role !== "VIEWER" &&
      (isWorkspaceAdmin(actor.member.role) ||
        !conversation.contactId ||
        conversation.contact?.ownerId === actor.member.userId ||
        editable.has(conversation.contactId)),
  }));
  return Response.json(
    { conversations, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) },
    { headers: messagingHeaders },
  );
}
