import "server-only";

import { forbidden } from "next/navigation";

import { Prisma, type WorkspaceRole } from "@prisma/client";

import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export async function getActiveWorkspaceMember(userId: string) {
  return (
    (await prisma.workspaceMember.findFirst({
      where: { userId, isDefault: true },
      include: { workspace: true },
    })) ??
    (await prisma.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
      include: { workspace: true },
    }))
  );
}

export async function getActiveWorkspace(userId: string) {
  return (await getActiveWorkspaceMember(userId))?.workspace ?? null;
}

export async function requireActiveWorkspaceMember() {
  const user = await requireAuth();
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) forbidden();
  return member;
}

export async function setActiveWorkspace(userId: string, workspaceId: string) {
  return prisma.$transaction(
    async (tx) => {
      const member = await tx.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
      if (!member) throw new Error("Not a member of this workspace");
      await tx.workspaceMember.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.workspaceMember.update({
        where: { userId_workspaceId: { userId, workspaceId } },
        data: { isDefault: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!member) throw new Error("Not a member of this workspace");
  return member;
}

export function canManageWorkspace(role: WorkspaceRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function canWriteWorkspace(role: WorkspaceRole) {
  return role !== "VIEWER";
}

export async function belongsToWorkspace(
  workspaceId: string,
  ids: {
    contactId?: string | null;
    companyId?: string | null;
    dealId?: string | null;
    stageId?: string | null;
    ownerId?: string | null;
  },
) {
  const checks = await Promise.all([
    ids.contactId ? prisma.contact.count({ where: { id: ids.contactId, workspaceId } }) : 1,
    ids.companyId ? prisma.company.count({ where: { id: ids.companyId, workspaceId } }) : 1,
    ids.dealId ? prisma.deal.count({ where: { id: ids.dealId, workspaceId } }) : 1,
    ids.stageId ? prisma.pipelineStage.count({ where: { id: ids.stageId, workspaceId } }) : 1,
    ids.ownerId ? prisma.workspaceMember.count({ where: { userId: ids.ownerId, workspaceId } }) : 1,
  ]);
  return checks.every(Boolean);
}
