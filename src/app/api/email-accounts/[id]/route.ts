import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

async function scope() {
  const user = await getCurrentUser();
  if (!user) return null;
  const member = await getActiveWorkspaceMember(user.id);
  return member ? { userId: user.id, workspaceId: member.workspaceId } : null;
}

export async function PATCH(request: Request, { params }: Context) {
  const current = await scope();
  if (!current) return Response.json({ error: "Not authorized" }, { status: 401, headers });
  const parsed = z.object({ syncEnabled: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid sync setting" }, { status: 400, headers });
  const { id } = await params;
  const result = await prisma.emailAccount.updateMany({ where: { id, ...current }, data: parsed.data });
  return result.count
    ? Response.json({ updated: true }, { headers })
    : Response.json({ error: "Not found" }, { status: 404, headers });
}

export async function DELETE(_request: Request, { params }: Context) {
  const current = await scope();
  if (!current) return Response.json({ error: "Not authorized" }, { status: 401, headers });
  const { id } = await params;
  const result = await prisma.emailAccount.deleteMany({ where: { id, ...current } });
  return result.count
    ? Response.json({ deleted: true }, { headers })
    : Response.json({ error: "Not found" }, { status: 404, headers });
}
