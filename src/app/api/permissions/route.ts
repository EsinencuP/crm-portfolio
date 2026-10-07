import { PermissionLevel, Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess, grantPermission, isEntityType, revokePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const id = z.string().trim().min(1).max(128);
const postSchema = z.object({
  entityType: z.enum(["Contact", "Deal", "Company"]),
  entityId: id,
  userId: id,
  permission: z.enum(PermissionLevel),
});

async function context() {
  const user = await getCurrentUser();
  if (!user?.id) return null;
  const member = await getActiveWorkspaceMember(user.id);
  return member ? { userId: user.id, workspaceId: member.workspaceId } : null;
}

export async function GET(request: Request) {
  const current = await context();
  if (!current) return Response.json({ error: "Sign in and select a workspace." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const entityType = params.get("entityType") ?? "";
  const entityId = id.safeParse(params.get("entityId"));
  if (!isEntityType(entityType) || !entityId.success)
    return Response.json({ error: "Invalid record." }, { status: 400, headers });
  if (!(await canAccess(current.userId, entityType, entityId.data, "FULL")))
    return Response.json({ error: "Full access required." }, { status: 403, headers });
  const permissions = await prisma.recordPermission.findMany({
    where: { workspaceId: current.workspaceId, entityType, entityId: entityId.data },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ permissions }, { headers });
}

export async function POST(request: Request) {
  const current = await context();
  if (!current) return Response.json({ error: "Sign in and select a workspace." }, { status: 401, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Send JSON." }, { status: 415, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid permission." }, { status: 400, headers });
  const { entityType, entityId, userId, permission } = parsed.data;
  if (!(await canAccess(current.userId, entityType, entityId, "FULL")))
    return Response.json({ error: "Full access required." }, { status: 403, headers });
  try {
    const result = await grantPermission(entityType, entityId, userId, permission, current.userId, current.workspaceId);
    return Response.json(result, { status: 201, headers });
  } catch (error) {
    if (error instanceof Error) return Response.json({ error: error.message }, { status: 400, headers });
    return Response.json({ error: "Unable to share record." }, { status: 500, headers });
  }
}

export async function DELETE(request: Request) {
  const current = await context();
  if (!current) return Response.json({ error: "Sign in and select a workspace." }, { status: 401, headers });
  const parsed = id.safeParse(new URL(request.url).searchParams.get("id"));
  if (!parsed.success) return Response.json({ error: "Invalid permission ID." }, { status: 400, headers });
  const permission = await prisma.recordPermission.findFirst({
    where: { id: parsed.data, workspaceId: current.workspaceId },
  });
  if (!permission) return Response.json({ error: "Permission not found." }, { status: 404, headers });
  if (!(await canAccess(current.userId, permission.entityType, permission.entityId, "FULL")))
    return Response.json({ error: "Full access required." }, { status: 403, headers });
  try {
    await revokePermission(permission.id);
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return Response.json({ error: "Permission not found." }, { status: 404, headers });
    return Response.json({ error: "Unable to remove permission." }, { status: 500, headers });
  }
}
