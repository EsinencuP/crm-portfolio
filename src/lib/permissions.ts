import "server-only";

import type { PermissionLevel, Prisma, WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const entityTypes = ["Contact", "Deal", "Company"] as const;
export type EntityType = (typeof entityTypes)[number];

const rank: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2, FULL: 3 };

export function isEntityType(value: string): value is EntityType {
  return entityTypes.some((type) => type === value);
}

export function isWorkspaceAdmin(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN";
}

async function findEntity(entityType: EntityType, entityId: string, workspaceId: string) {
  if (entityType === "Contact")
    return prisma.contact.findFirst({ where: { id: entityId, workspaceId }, select: { id: true, ownerId: true } });
  if (entityType === "Deal")
    return prisma.deal.findFirst({ where: { id: entityId, workspaceId }, select: { id: true, ownerId: true } });
  return prisma.company.findFirst({ where: { id: entityId, workspaceId }, select: { id: true } });
}

export async function canAccess(
  userId: string,
  entityType: string,
  entityId: string,
  requiredLevel: Exclude<PermissionLevel, "NONE">,
): Promise<boolean> {
  if (!isEntityType(entityType)) return false;
  const member = await getActiveWorkspaceMember(userId);
  if (!member) return false;
  const entity = await findEntity(entityType, entityId, member.workspaceId);
  if (!entity) return false;
  if (isWorkspaceAdmin(member.role)) return true;
  const grant = await prisma.recordPermission.findUnique({
    where: {
      workspaceId_entityType_entityId_userId: { workspaceId: member.workspaceId, entityType, entityId, userId },
    },
    select: { permission: true },
  });
  if (member.role === "VIEWER") return requiredLevel === "VIEW" && grant?.permission !== "NONE";
  if ("ownerId" in entity && entity.ownerId === userId) return true;
  if (grant?.permission === "NONE") return false;
  return grant ? rank[grant.permission] >= rank[requiredLevel] : false;
}

export async function getAccessibleEntityIds(
  userId: string,
  entityType: string,
  workspaceId: string,
): Promise<string[]> {
  if (!isEntityType(entityType)) return [];
  const member = await getActiveWorkspaceMember(userId);
  if (!member || member.workspaceId !== workspaceId) return [];
  let recordsQuery: Promise<{ id: string; ownerId?: string | null }[]>;
  if (entityType === "Contact")
    recordsQuery = prisma.contact.findMany({ where: { workspaceId }, select: { id: true, ownerId: true } });
  else if (entityType === "Deal")
    recordsQuery = prisma.deal.findMany({ where: { workspaceId }, select: { id: true, ownerId: true } });
  else recordsQuery = prisma.company.findMany({ where: { workspaceId }, select: { id: true } });
  const [records, grants] = await Promise.all([
    recordsQuery,
    prisma.recordPermission.findMany({
      where: { workspaceId, entityType, userId },
      select: { entityId: true, permission: true },
    }),
  ]);
  if (isWorkspaceAdmin(member.role)) return records.map(({ id }) => id);
  const permissions = new Map(grants.map(({ entityId, permission }) => [entityId, permission]));
  return records
    .filter((record) =>
      member.role === "VIEWER"
        ? permissions.get(record.id) !== "NONE"
        : ("ownerId" in record && record.ownerId === userId) ||
          Boolean(permissions.get(record.id) && permissions.get(record.id) !== "NONE"),
    )
    .map(({ id }) => id);
}

export async function activityAccessWhere(userId: string, workspaceId: string): Promise<Prisma.ActivityWhereInput> {
  const member = await getActiveWorkspaceMember(userId);
  if (member?.workspaceId === workspaceId && isWorkspaceAdmin(member.role)) return { workspaceId };
  const [contactIds, dealIds] = await Promise.all([
    getAccessibleEntityIds(userId, "Contact", workspaceId),
    getAccessibleEntityIds(userId, "Deal", workspaceId),
  ]);
  return {
    workspaceId,
    AND: [
      { OR: [{ contactId: null }, { contactId: { in: contactIds } }] },
      { OR: [{ dealId: null }, { dealId: { in: dealIds } }] },
      { OR: [{ contactId: { not: null } }, { dealId: { not: null } }, { ownerId: userId }] },
    ],
  };
}

export async function canEditActivity(userId: string, activityId: string, workspaceId: string) {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, workspaceId },
    select: { ownerId: true, contactId: true, dealId: true },
  });
  if (!activity) return false;
  const member = await getActiveWorkspaceMember(userId);
  if (!member || member.workspaceId !== workspaceId || member.role === "VIEWER") return false;
  if (isWorkspaceAdmin(member.role)) return true;
  if (activity.contactId && !(await canAccess(userId, "Contact", activity.contactId, "EDIT"))) return false;
  if (activity.dealId && !(await canAccess(userId, "Deal", activity.dealId, "EDIT"))) return false;
  return Boolean(activity.contactId || activity.dealId || activity.ownerId === userId);
}

export async function grantPermission(
  entityType: string,
  entityId: string,
  targetUserId: string,
  level: PermissionLevel,
  grantedById: string,
  workspaceId: string,
) {
  if (!isEntityType(entityType)) throw new Error("Unsupported entity type.");
  const [entity, target, grantor] = await Promise.all([
    findEntity(entityType, entityId, workspaceId),
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: targetUserId, workspaceId } } }),
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: grantedById, workspaceId } } }),
  ]);
  if (!entity || !target || !grantor) throw new Error("Record or workspace member not found.");
  if (!(await canAccess(grantedById, entityType, entityId, "FULL"))) throw new Error("Full access required.");
  if (target.role === "VIEWER" && rank[level] > rank.VIEW) throw new Error("Viewer can only receive view access.");
  return prisma.recordPermission.upsert({
    where: { workspaceId_entityType_entityId_userId: { workspaceId, entityType, entityId, userId: targetUserId } },
    create: { workspaceId, entityType, entityId, userId: targetUserId, permission: level, grantedById },
    update: { permission: level, grantedById },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });
}

export async function revokePermission(permissionId: string) {
  return prisma.recordPermission.delete({ where: { id: permissionId } });
}
