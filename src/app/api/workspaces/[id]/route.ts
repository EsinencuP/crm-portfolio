import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspace, requireWorkspaceMembership } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    logoUrl: z
      .union([
        z.url().max(2048),
        z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
          .max(350_000),
      ])
      .nullable()
      .optional(),
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
    defaultCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();

async function membership(id: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: Response.json({ error: "Please sign in." }, { status: 401, headers }) };
  const member = await requireWorkspaceMembership(session.user.id, id).catch(() => null);
  if (!member) return { response: Response.json({ error: "Workspace not found." }, { status: 404, headers }) };
  return { member, userId: session.user.id };
}

export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const access = await membership(id);
  if (access.response) return access.response;
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  return Response.json({ workspace, role: access.member?.role }, { headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const access = await membership(id);
  if (access.response) return access.response;
  if (!access.member || !canManageWorkspace(access.member.role))
    return Response.json({ error: "Owner or admin access required." }, { status: 403, headers });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !Object.keys(parsed.data).length)
    return Response.json({ error: "Invalid workspace changes." }, { status: 400, headers });
  try {
    const workspace = await prisma.workspace.update({ where: { id }, data: parsed.data });
    return Response.json({ workspace }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "Workspace slug is already taken." }, { status: 409, headers });
    return Response.json({ error: "Unable to update workspace." }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const access = await membership(id);
  if (access.response) return access.response;
  if (access.member?.role !== "OWNER")
    return Response.json({ error: "Owner access required." }, { status: 403, headers });
  if (!access.userId) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const userId = access.userId;
  try {
    await prisma.$transaction(
      async (tx) => {
        const owner = await tx.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId: id } },
        });
        if (owner?.role !== "OWNER") throw new Error("Owner access required");
        const defaults = await tx.workspaceMember.findMany({
          where: { workspaceId: id, isDefault: true },
          select: { userId: true },
        });
        await tx.note.deleteMany({ where: { workspaceId: id } });
        await tx.activity.deleteMany({ where: { workspaceId: id } });
        await tx.deal.deleteMany({ where: { workspaceId: id } });
        await tx.contact.deleteMany({ where: { workspaceId: id } });
        await tx.company.deleteMany({ where: { workspaceId: id } });
        await tx.tag.deleteMany({ where: { workspaceId: id } });
        await tx.pipelineStage.deleteMany({ where: { workspaceId: id } });
        await tx.workspace.delete({ where: { id } });
        for (const { userId } of defaults) {
          const next = await tx.workspaceMember.findFirst({
            where: { userId },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
          });
          if (next) await tx.workspaceMember.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      },
      { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to delete workspace." }, { status: 500, headers });
  }
}
