import { Prisma, Role } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const bodySchema = z.object({ role: z.enum(Role) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (actor.role !== "ADMIN") return Response.json({ error: "Admin access required." }, { status: 403, headers });
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

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({ where: { id }, select: { role: true } });
        if (!target) return null;
        if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
          const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
          if (adminCount <= 1) return "last-admin" as const;
        }
        return tx.user.update({
          where: { id },
          data: { role: parsed.data.role },
          select: { id: true, name: true, email: true, avatarUrl: true, role: true, createdAt: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result === null) return Response.json({ error: "User not found." }, { status: 404, headers });
    if (result === "last-admin")
      return Response.json({ error: "The last admin cannot be demoted." }, { status: 409, headers });
    return Response.json({ user: result }, { headers });
  } catch {
    return Response.json({ error: "Unable to update role. Please retry." }, { status: 500, headers });
  }
}
