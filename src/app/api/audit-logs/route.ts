import { AuditAction, type Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const dateInput = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  entityType: z.enum(["Contact", "Company", "Deal", "Activity", "Note", "Tag", "PipelineStage"]).optional(),
  entityId: z.string().trim().min(1).max(128).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
  action: z.nativeEnum(AuditAction).optional(),
  dateFrom: dateInput.optional(),
  dateTo: dateInput.optional(),
});

function dateBoundary(value: string, end: boolean) {
  if (value.length === 10) return new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  return new Date(value);
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(session.user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role !== "OWNER" && member.role !== "ADMIN")
    return Response.json({ error: "Workspace admin access required." }, { status: 403, headers });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(
    Object.fromEntries(
      ["page", "limit", "entityType", "entityId", "userId", "action", "dateFrom", "dateTo"]
        .filter((key) => params.has(key))
        .map((key) => [key, params.get(key)]),
    ),
  );
  if (!parsed.success) return Response.json({ error: "Invalid audit filters." }, { status: 400, headers });
  const { page, limit, entityType, entityId, userId, action, dateFrom, dateTo } = parsed.data;
  const from = dateFrom ? dateBoundary(dateFrom, false) : undefined;
  const to = dateTo ? dateBoundary(dateTo, true) : undefined;
  if (from && to && from > to) return Response.json({ error: "Invalid date range." }, { status: 400, headers });

  const where: Prisma.AuditLogWhereInput = {
    workspaceId: member.workspaceId,
    ...(entityType && { entityType }),
    ...(entityId && { entityId }),
    ...(userId && { userId }),
    ...(action && { action }),
    ...((from ?? to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };
  try {
    const [logs, total, actors] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where: { workspaceId: member.workspaceId },
        distinct: ["userId"],
        select: { user: { select: { id: true, name: true } } },
        orderBy: { userId: "asc" },
      }),
    ]);
    const users = actors.map(({ user }) => user).sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ logs, total, page, totalPages: Math.ceil(total / limit), users }, { headers });
  } catch {
    return Response.json({ error: "Unable to load audit log." }, { status: 500, headers });
  }
}
