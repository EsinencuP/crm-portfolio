import { Prisma } from "@prisma/client";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultPipelineStages } from "@/lib/workspace-defaults";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export const workspaceInput = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: [{ isDefault: "desc" }, { joinedAt: "asc" }],
  });
  return Response.json(
    { workspaces: memberships.map(({ workspace, role, isDefault }) => ({ ...workspace, role, isDefault })) },
    { headers },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const parsed = workspaceInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid workspace name or slug." }, { status: 400, headers });
  try {
    const workspace = await prisma.$transaction(
      async (tx) => {
        const created = await tx.workspace.create({ data: parsed.data });
        await tx.pipelineStage.createMany({
          data: defaultPipelineStages.map((stage) => ({ ...stage, workspaceId: created.id })),
        });
        await tx.workspaceMember.updateMany({ where: { userId: session.user.id }, data: { isDefault: false } });
        await tx.workspaceMember.create({
          data: { userId: session.user.id, workspaceId: created.id, role: "OWNER", isDefault: true },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return Response.json({ workspace }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "Workspace slug is already taken." }, { status: 409, headers });
    return Response.json({ error: "Unable to create workspace." }, { status: 500, headers });
  }
}
