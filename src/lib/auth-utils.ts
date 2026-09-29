import "server-only";

import { forbidden, redirect } from "next/navigation";

import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
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
