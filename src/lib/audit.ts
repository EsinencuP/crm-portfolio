import "server-only";

import { type AuditAction, Prisma } from "@prisma/client";

import { auditJsonValue } from "@/lib/audit-core";
import { prisma } from "@/lib/prisma";

export { computeChanges } from "@/lib/audit-core";

export interface AuditLogInput {
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityName?: string | null;
  changes?: Record<string, { old: unknown; new: unknown }> | null;
  userId: string;
  workspaceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function createAuditLog(input: AuditLogInput, db: Pick<typeof prisma, "auditLog"> = prisma) {
  return db.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityName: input.entityName,
      changes: input.changes ? (auditJsonValue(input.changes) ?? Prisma.JsonNull) : Prisma.JsonNull,
      userId: input.userId,
      workspaceId: input.workspaceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
