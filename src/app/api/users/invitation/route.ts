import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { registrationSchema } from "@/lib/validations/registration";

import { createHash } from "node:crypto";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const acceptSchema = z.object({
  token: tokenSchema,
  name: registrationSchema.shape.name.optional(),
  password: registrationSchema.shape.password.optional(),
});

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function GET(request: Request) {
  const parsed = tokenSchema.safeParse(new URL(request.url).searchParams.get("token"));
  if (!parsed.success) return Response.json({ error: "Invalid invitation link." }, { status: 400, headers });
  const invite = await prisma.teamInvite.findUnique({
    where: { tokenHash: digest(parsed.data) },
    select: { email: true, role: true, expiresAt: true, acceptedAt: true },
  });
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date())
    return Response.json({ error: "This invitation has expired or has already been used." }, { status: 410, headers });
  const existing = await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } });
  return Response.json({ email: invite.email, role: invite.role, existingUser: !!existing }, { headers });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid invitation details." }, { status: 400, headers });
  const tokenHash = digest(parsed.data.token);
  const current = await getCurrentUser();
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const invite = await tx.teamInvite.findUnique({ where: { tokenHash } });
        if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) return "expired" as const;
        const existing = await tx.user.findUnique({ where: { email: invite.email }, select: { id: true } });
        let userId: string;
        if (existing) {
          if (current?.email !== invite.email) return "sign-in" as const;
          userId = existing.id;
        } else {
          if (!parsed.data.name || !parsed.data.password) return "details" as const;
          const passwordHash = await hash(parsed.data.password, 12);
          const created = await tx.user.create({
            data: { email: invite.email, name: parsed.data.name, passwordHash },
            select: { id: true },
          });
          userId = created.id;
        }
        const hasMembership = await tx.workspaceMember.count({ where: { userId } });
        await tx.workspaceMember.upsert({
          where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
          create: { userId, workspaceId: invite.workspaceId, role: invite.role, isDefault: hasMembership === 0 },
          update: { role: invite.role },
        });
        await tx.teamInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
        return { userId, email: invite.email, existingUser: !!existing };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (result === "expired")
      return Response.json(
        { error: "This invitation has expired or has already been used." },
        { status: 410, headers },
      );
    if (result === "sign-in")
      return Response.json({ error: "Sign in with the invited email address first." }, { status: 403, headers });
    if (result === "details")
      return Response.json({ error: "Name and password are required." }, { status: 400, headers });
    return Response.json({ success: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json(
        { error: "This email is already registered. Sign in and accept the invitation." },
        { status: 409, headers },
      );
    return Response.json({ error: "Unable to accept invitation. Please retry." }, { status: 500, headers });
  }
}
