import { Prisma, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ role: z.enum(WorkspaceRole) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(actor.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role !== "OWNER" && member.role !== "ADMIN")
    return Response.json({ error: "Owner or admin access required." }, { status: 403, headers });
  const { id } = await params;
  if (id === actor.id) return Response.json({ error: "You cannot change your own role." }, { status: 400, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid role." }, { status: 400, headers });
  if (parsed.data.role === "OWNER" && member.role !== "OWNER")
    return Response.json({ error: "Only an owner can grant ownership." }, { status: 403, headers });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: id, workspaceId: member.workspaceId } },
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, createdAt: true } } },
        });
        if (!target) return null;
        if (target.role === "OWNER" && parsed.data.role !== "OWNER") {
          if (member.role !== "OWNER") return "owner-only" as const;
          const ownerCount = await tx.workspaceMember.count({
            where: { workspaceId: member.workspaceId, role: "OWNER" },
          });
          if (ownerCount <= 1) return "last-owner" as const;
        }
        await tx.workspaceMember.update({
          where: { id: target.id },
          data: { role: parsed.data.role },
        });
        return { ...target.user, role: parsed.data.role };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result === null) return Response.json({ error: "User not found." }, { status: 404, headers });
    if (result === "owner-only")
      return Response.json({ error: "Only owners can change owner roles." }, { status: 403, headers });
    if (result === "last-owner")
      return Response.json({ error: "The last owner cannot be demoted." }, { status: 409, headers });
    return Response.json({ user: result }, { headers });
  } catch {
    return Response.json({ error: "Unable to update role. Please retry." }, { status: 500, headers });
  }
}
