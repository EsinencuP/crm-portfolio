import { NotificationType } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { markAllAsRead, markAsRead } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z.enum(["true", "false"]).default("false"),
  type: z.enum(NotificationType).optional(),
});
const idsSchema = z.object({ ids: z.array(idSchema).min(1).max(100) });

async function currentWorkspace(): Promise<
  { ok: true; userId: string; workspaceId: string } | { ok: false; response: Response }
> {
  const user = await getCurrentUser();
  if (!user?.id) return { ok: false, response: Response.json({ error: "Please sign in." }, { status: 401, headers }) };
  const member = await getActiveWorkspaceMember(user.id);
  if (!member)
    return { ok: false, response: Response.json({ error: "Create a workspace first." }, { status: 409, headers }) };
  return { ok: true, userId: user.id, workspaceId: member.workspaceId };
}

export async function GET(request: Request) {
  const current = await currentWorkspace();
  if (!current.ok) return current.response;
  const params = new URL(request.url).searchParams;
  const query = listSchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    unreadOnly: params.get("unreadOnly") ?? undefined,
    type: params.get("type") ?? undefined,
  });
  if (!query.success) return Response.json({ error: "Invalid notification filters." }, { status: 400, headers });
  const { page, limit, unreadOnly, type } = query.data;
  const where = {
    userId: current.userId,
    workspaceId: current.workspaceId,
    ...(unreadOnly === "true" && { read: false }),
    ...(type && { type }),
  };
  try {
    const [notifications, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);
    return Response.json({ notifications, total, page, totalPages: Math.ceil(total / limit) }, { headers });
  } catch {
    return Response.json({ error: "Unable to load notifications." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request) {
  const current = await currentWorkspace();
  if (!current.ok) return current.response;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Send JSON." }, { status: 415, headers });
  const body: unknown = await request.json().catch(() => null);
  const all = z.object({ all: z.literal(true) }).safeParse(body);
  const ids = idsSchema.safeParse(body);
  if (!all.success && !ids.success)
    return Response.json({ error: "Provide notification IDs or all: true." }, { status: 400, headers });
  try {
    let result: { count: number };
    if (all.success) result = await markAllAsRead(current.userId, current.workspaceId);
    else if (ids.success && ids.data.ids.length === 1)
      result = await markAsRead(ids.data.ids[0], current.userId, current.workspaceId);
    else if (ids.success)
      result = await prisma.notification.updateMany({
        where: { id: { in: ids.data.ids }, userId: current.userId, workspaceId: current.workspaceId, read: false },
        data: { read: true, readAt: new Date() },
      });
    else return Response.json({ error: "Provide notification IDs." }, { status: 400, headers });
    return Response.json({ updated: result.count }, { headers });
  } catch {
    return Response.json({ error: "Unable to update notifications." }, { status: 500, headers });
  }
}

export async function DELETE(request: Request) {
  const current = await currentWorkspace();
  if (!current.ok) return current.response;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Send JSON." }, { status: 415, headers });
  const parsed = idsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Provide notification IDs." }, { status: 400, headers });
  try {
    const result = await prisma.notification.deleteMany({
      where: { id: { in: parsed.data.ids }, userId: current.userId, workspaceId: current.workspaceId },
    });
    return Response.json({ deleted: result.count }, { headers });
  } catch {
    return Response.json({ error: "Unable to delete notifications." }, { status: 500, headers });
  }
}
