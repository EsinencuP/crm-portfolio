import "server-only";

import { forbidden, redirect } from "next/navigation";

import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true },
  });
  return user ? { ...session.user, ...user } : null;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) forbidden();
  return user;
}
