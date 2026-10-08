import "server-only";

import type { Prisma, WorkspaceMember } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import type prisma from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

import type { WorkflowEntity } from "./config";

export type WorkflowDb = Pick<
  typeof prisma,
  | "workflow"
  | "workflowStep"
  | "workflowRun"
  | "workspaceMember"
  | "contact"
  | "deal"
  | "activity"
  | "emailMessage"
  | "recordPermission"
  | "tag"
  | "pipelineStage"
  | "emailAccount"
  | "notification"
  | "auditLog"
>;
export const workflowHeaders = { "Cache-Control": "private, no-store" };
export async function workflowActor() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Please sign in." }, { status: 401, headers: workflowHeaders }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member)
    return { error: Response.json({ error: "Select a workspace." }, { status: 409, headers: workflowHeaders }) };
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role))
    return {
      error: Response.json({ error: "Workspace manager required." }, { status: 403, headers: workflowHeaders }),
    };
  return { member };
}
export function workflowWhere(member: WorkspaceMember): Prisma.WorkflowWhereInput {
  return {
    workspaceId: member.workspaceId,
    deletedAt: null,
    ...(!["OWNER", "ADMIN"].includes(member.role) ? { createdById: member.userId } : {}),
  };
}
export async function loadEntity(db: WorkflowDb, entityType: WorkflowEntity, entityId: string, workspaceId: string) {
  const where = { id: entityId, workspaceId };
  if (entityType === "Contact") return db.contact.findFirst({ where });
  if (entityType === "Deal") return db.deal.findFirst({ where });
  if (entityType === "Activity") return db.activity.findFirst({ where });
  return db.emailMessage.findFirst({ where, include: { account: { select: { userId: true } } } });
}
export async function entityAccess(
  db: WorkflowDb,
  member: WorkspaceMember,
  entityType: WorkflowEntity,
  entityId: string,
  level: "VIEW" | "EDIT" | "FULL" = "EDIT",
): Promise<boolean> {
  const entity = await loadEntity(db, entityType, entityId, member.workspaceId);
  if (!entity || member.role === "VIEWER") return false;
  if (["OWNER", "ADMIN"].includes(member.role)) return true;
  if (entityType === "Activity") {
    if (!("ownerId" in entity)) return false;
    const contactId = "contactId" in entity ? entity.contactId : null;
    const dealId = "dealId" in entity ? entity.dealId : null;
    if (contactId && !(await entityAccess(db, member, "Contact", contactId, level))) return false;
    if (dealId && !(await entityAccess(db, member, "Deal", dealId, level))) return false;
    return Boolean(contactId || dealId || entity.ownerId === member.userId);
  }
  if (entityType === "EmailMessage") return "account" in entity && entity.account.userId === member.userId;
  if ("ownerId" in entity && entity.ownerId === member.userId) return true;
  const grant = await db.recordPermission.findUnique({
    where: {
      workspaceId_entityType_entityId_userId: {
        workspaceId: member.workspaceId,
        entityType,
        entityId,
        userId: member.userId,
      },
    },
    select: { permission: true },
  });
  const permitted = level === "FULL" ? ["FULL"] : level === "EDIT" ? ["EDIT", "FULL"] : ["VIEW", "EDIT", "FULL"];
  return Boolean(grant && permitted.includes(grant.permission));
}
export class WorkflowAccessError extends Error {}
export async function creatorMember(db: WorkflowDb, userId: string, workspaceId: string) {
  const member = await db.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!member || !["OWNER", "ADMIN", "MANAGER"].includes(member.role))
    throw new WorkflowAccessError("Workflow creator no longer has manager access.");
  return member;
}
