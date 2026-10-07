import "server-only";

import type { Prisma, WorkspaceMember } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess, getAccessibleEntityIds, isWorkspaceAdmin } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const messagingHeaders = { "Cache-Control": "private, no-store" };
export const channelSelect = {
  id: true,
  platform: true,
  channelId: true,
  channelName: true,
  phoneNumber: true,
  botUsername: true,
  isActive: true,
} satisfies Prisma.MessagingChannelSelect;
export async function messagingActor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401, headers: messagingHeaders }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member)
    return { error: Response.json({ error: "Select a workspace first." }, { status: 409, headers: messagingHeaders }) };
  return { member };
}
export async function conversationAccessWhere(
  member: WorkspaceMember,
): Promise<Prisma.MessagingConversationWhereInput> {
  const scope = { channel: { workspaceId: member.workspaceId } };
  if (isWorkspaceAdmin(member.role)) return scope;
  const ids = await getAccessibleEntityIds(member.userId, "Contact", member.workspaceId);
  return { ...scope, OR: [{ contactId: null }, { contactId: { in: ids } }] };
}
export async function accessibleConversation(id: string, member: WorkspaceMember) {
  return prisma.messagingConversation.findFirst({
    where: { AND: [{ id }, await conversationAccessWhere(member)] },
    include: { channel: true },
  });
}
export async function canWriteConversation(member: WorkspaceMember, conversation: { contactId: string | null }) {
  if (member.role === "VIEWER") return false;
  return !conversation.contactId || (await canAccess(member.userId, "Contact", conversation.contactId, "EDIT"));
}
