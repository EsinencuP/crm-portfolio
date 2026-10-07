import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";

import { auditJsonValue, computeChanges } from "@/lib/audit-core";

const auditedFields = {
  Contact: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "jobTitle",
    "avatarUrl",
    "source",
    "status",
    "city",
    "country",
    "linkedinUrl",
    "notes_text",
    "companyId",
    "ownerId",
    "customFields",
  ],
  Company: ["name", "domain", "industry", "size", "logoUrl", "website", "address", "description", "phone"],
  Deal: [
    "title",
    "value",
    "currency",
    "closeDate",
    "priority",
    "description",
    "stageId",
    "contactId",
    "companyId",
    "ownerId",
  ],
  Activity: ["type", "title", "description", "dueDate", "completed", "completedAt", "contactId", "dealId", "ownerId"],
  Note: ["content", "contactId", "companyId", "dealId", "authorId"],
  Tag: ["name", "color"],
  PipelineStage: ["name", "color", "position", "probability"],
} as const;

type AuditModel = keyof typeof auditedFields;
type Row = Record<string, unknown> & { id: string; workspaceId: string };
type Delegate = { findMany(args: { where: unknown }): Promise<Row[]> };

function isAuditModel(model: string | undefined): model is AuditModel {
  return Boolean(model && model in auditedFields);
}

function delegateFor(client: PrismaClient, model: AuditModel): Delegate {
  const name = `${model[0].toLowerCase()}${model.slice(1)}`;
  return (client as unknown as Record<string, Delegate>)[name];
}

function entityName(model: AuditModel, row: Row): string | null {
  if (model === "Contact") return [row.firstName, row.lastName].filter(Boolean).join(" ") || null;
  if (model === "Deal" || model === "Activity") return typeof row.title === "string" ? row.title : null;
  if (model === "Note") return typeof row.content === "string" ? row.content.slice(0, 80) : null;
  return typeof row.name === "string" ? row.name : null;
}

async function requestActor() {
  let requestHeaders: Awaited<ReturnType<typeof import("next/headers")["headers"]>>;
  try {
    const { headers } = await import("next/headers");
    requestHeaders = await headers();
  } catch {
    // CLI jobs have no request context. Never hide an Auth.js failure in a request.
    return null;
  }
  // This runs only after the Prisma client has initialized; Auth.js uses that client for session reads.
  // biome-ignore lint/suspicious/noImportCycles: The import is deferred until a query is executing.
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    userId: session.user.id,
    ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: requestHeaders.get("user-agent")?.slice(0, 512) ?? null,
  };
}

function hasRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && "id" in value && "workspaceId" in value;
}

export function withAuditLog(base: PrismaClient) {
  return base.$extends({
    name: "crm-audit-log",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (
            !isAuditModel(model) ||
            !["create", "createManyAndReturn", "update", "updateMany", "delete", "deleteMany", "upsert"].includes(
              operation,
            )
          ) {
            return query(args);
          }

          const actor = await requestActor();
          if (!actor) return query(args);
          const input = args as Record<string, unknown>;
          const delegate = delegateFor(base, model);
          const previous = ["update", "updateMany", "deleteMany", "upsert"].includes(operation)
            ? await delegate.findMany({ where: input.where ?? {} })
            : [];
          const result = await query(args);
          let rows: Row[] = [];
          if (Array.isArray(result)) rows = result.filter(hasRow);
          else if (hasRow(result)) rows = [result];
          else if (operation === "deleteMany" || operation === "updateMany") rows = previous;

          for (const row of rows) {
            // A workspace being created in the same transaction is not yet visible
            // to this independent audit connection. Its initial stage seeding is
            // system initialization, not a user edit.
            const membership = await base.workspaceMember.findUnique({
              where: { userId_workspaceId: { userId: actor.userId, workspaceId: row.workspaceId } },
              select: { id: true },
            });
            if (!membership) continue;

            const old = previous.find((item) => item.id === row.id) ?? (operation === "delete" ? row : null);
            let action: "CREATE" | "UPDATE" | "DELETE" = "CREATE";
            if (operation.startsWith("delete")) action = "DELETE";
            else if (old) action = "UPDATE";
            const softDelete =
              model === "Contact" && operation === "update" && row.status === "ARCHIVED" && old?.status !== "ARCHIVED";
            if (softDelete) action = "DELETE";
            const oldData = action === "CREATE" ? {} : (old ?? {});
            let newData: Record<string, unknown> = row;
            if (action === "DELETE" && !softDelete) newData = {};
            else if (operation === "updateMany") newData = { ...row, ...(input.data as object) };
            const changes = computeChanges(oldData, newData, [...auditedFields[model]]);
            await base.auditLog.create({
              data: {
                action,
                entityType: model,
                entityId: row.id,
                entityName: entityName(model, row),
                changes: changes ? (auditJsonValue(changes) ?? Prisma.JsonNull) : Prisma.JsonNull,
                userId: actor.userId,
                workspaceId: row.workspaceId,
                ipAddress: actor.ipAddress,
                userAgent: actor.userAgent,
              },
            });
          }
          return result;
        },
      },
    },
  });
}
