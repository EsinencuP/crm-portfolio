import { Prisma, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, requireWorkspaceMembership } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
const addSchema = z.object({ userId: z.string().min(1), role: z.nativeEnum(WorkspaceRole).default("MEMBER") });
const removeSchema = z.object({ userId: z.string().min(1) });

async function access(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: Response.json({ error: "Please sign in." }, { status: 401, headers }) };
  const member = await requireWorkspaceMembership(session.user.id, id).catch(() => null);
  if (!member) return { response: Response.json({ error: "Workspace not found." }, { status: 404, headers }) };
  return { member };
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const check = await access(id);
  if (check.response) return check.response;
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return Response.json({ members }, { headers });
}

export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  const check = await access(id);
  if (check.response) return check.response;
  if (!check.member || !canManageWorkspace(check.member.role))
    return Response.json({ error: "Owner or admin access required." }, { status: 403, headers });
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid member details." }, { status: 400, headers });
  if (parsed.data.role === "OWNER" && check.member.role !== "OWNER")
    return Response.json({ error: "Only an owner can grant ownership." }, { status: 403, headers });
  try {
    const member = await prisma.workspaceMember.create({ data: { ...parsed.data, workspaceId: id } });
    return Response.json({ member }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "User is already a member." }, { status: 409, headers });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      return Response.json({ error: "User does not exist." }, { status: 404, headers });
    return Response.json({ error: "Unable to add member." }, { status: 500, headers });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  const check = await access(id);
  if (check.response) return check.response;
  if (!check.member || !canManageWorkspace(check.member.role))
    return Response.json({ error: "Owner or admin access required." }, { status: 403, headers });
  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid user ID." }, { status: 400, headers });
  const target = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: parsed.data.userId, workspaceId: id } },
  });
  if (!target) return Response.json({ error: "Member not found." }, { status: 404, headers });
  if (target.role === "OWNER") {
    if (check.member.role !== "OWNER")
      return Response.json({ error: "Only owners can remove owners." }, { status: 403, headers });
    const owners = await prisma.workspaceMember.count({ where: { workspaceId: id, role: "OWNER" } });
    if (owners <= 1) return Response.json({ error: "The last owner cannot be removed." }, { status: 409, headers });
  }
  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { workspaceId: id, userId: target.userId } });
    await tx.recordPermission.deleteMany({ where: { workspaceId: id, userId: target.userId } });
    await tx.workspaceMember.delete({ where: { id: target.id } });
  });
  if (target.isDefault) {
    const next = await prisma.workspaceMember.findFirst({
      where: { userId: target.userId },
      orderBy: { joinedAt: "asc" },
    });
    if (next) await prisma.workspaceMember.update({ where: { id: next.id }, data: { isDefault: true } });
  }
  return Response.json({ success: true }, { headers });
}
