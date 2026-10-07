import { type Prisma, Role } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  role: z.enum(Role),
});

function allowed(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (!allowed(member.role)) return Response.json({ error: "Manager access required." }, { status: 403, headers });
  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    workspaceMembers: { some: { workspaceId: member.workspaceId } },
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };
  const [users, total, invites] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        createdAt: true,
        workspaceMembers: { where: { workspaceId: member.workspaceId }, select: { role: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
    prisma.teamInvite.findMany({
      where: {
        workspaceId: member.workspaceId,
        acceptedAt: null,
        ...(search ? { email: { contains: search, mode: "insensitive" } } : {}),
      },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return Response.json(
    {
      users: users.map(({ workspaceMembers, ...row }) => ({ ...row, role: workspaceMembers[0]?.role ?? "MEMBER" })),
      invites,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    { headers },
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (!allowed(member.role)) return Response.json({ error: "Manager access required." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter a valid email and role." }, { status: 400, headers });
  if (member.role === "MANAGER" && !["MEMBER", "VIEWER"].includes(parsed.data.role))
    return Response.json({ error: "Managers can invite members and viewers only." }, { status: 403, headers });
  if (parsed.data.email === user.email)
    return Response.json({ error: "You cannot invite yourself." }, { status: 400, headers });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invite = await prisma.teamInvite.upsert({
    where: { workspaceId_email: { workspaceId: member.workspaceId, email: parsed.data.email } },
    create: { ...parsed.data, workspaceId: member.workspaceId, tokenHash, expiresAt, invitedById: user.id },
    update: {
      role: parsed.data.role,
      tokenHash,
      expiresAt,
      invitedById: user.id,
      acceptedAt: null,
      createdAt: new Date(),
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  const inviteUrl = new URL(`/invite/${token}`, request.url).toString();
  return Response.json({ invite, inviteUrl }, { status: 201, headers });
}
