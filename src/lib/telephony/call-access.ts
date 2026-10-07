import "server-only";

import type { Prisma, WorkspaceMember } from "@prisma/client";

import { canAccess, getAccessibleEntityIds, isWorkspaceAdmin } from "@/lib/permissions";

export async function callAccessWhere(member: WorkspaceMember): Promise<Prisma.PhoneCallWhereInput> {
  if (isWorkspaceAdmin(member.role)) return { workspaceId: member.workspaceId };
  const [contactIds, dealIds] = await Promise.all([
    getAccessibleEntityIds(member.userId, "Contact", member.workspaceId),
    getAccessibleEntityIds(member.userId, "Deal", member.workspaceId),
  ]);
  return {
    workspaceId: member.workspaceId,
    AND: [
      { OR: [{ contactId: null }, { contactId: { in: contactIds } }] },
      { OR: [{ dealId: null }, { dealId: { in: dealIds } }] },
      { OR: [{ contactId: { not: null } }, { dealId: { not: null } }, { userId: member.userId }] },
    ],
  };
}

export async function canEditCall(
  member: WorkspaceMember,
  call: { userId: string; contactId: string | null; dealId: string | null },
) {
  if (member.role === "VIEWER") return false;
  if (isWorkspaceAdmin(member.role)) return true;
  if (call.contactId && !(await canAccess(member.userId, "Contact", call.contactId, "EDIT"))) return false;
  if (call.dealId && !(await canAccess(member.userId, "Deal", call.dealId, "EDIT"))) return false;
  return Boolean(call.contactId) || Boolean(call.dealId) || call.userId === member.userId;
}
