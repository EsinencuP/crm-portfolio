import "server-only";

import type { NextResponse } from "next/server";

import { randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthProvider = "GMAIL" | "OUTLOOK";
const cookieName = "crm_email_oauth";

export function emailRedirectUri(provider: OAuthProvider) {
  const origin = process.env.EMAIL_OAUTH_BASE_URL ?? process.env.NEXTAUTH_URL;
  if (!origin) throw new Error("EMAIL_OAUTH_BASE_URL is not configured");
  const base = new URL(origin);
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.hostname === "localhost"))
    throw new Error("Email OAuth requires HTTPS");
  return new URL(`/api/email-accounts/callback/${provider.toLowerCase()}`, base.origin).toString();
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function startOAuth(
  response: NextResponse,
  state: string,
  provider: OAuthProvider,
  userId: string,
  workspaceId: string,
) {
  response.cookies.set(cookieName, JSON.stringify({ state, provider, userId, workspaceId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/email-accounts/callback",
    maxAge: 600,
  });
}

export function validateOAuth(
  request: Request,
  provider: OAuthProvider,
  userId: string,
  workspaceId: string,
  state: string | null,
) {
  const cookies = request.headers.get("cookie") ?? "";
  const raw = cookies
    .split("; ")
    .find((entry) => entry.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!raw || !state) return false;
  try {
    const saved: { state: string; provider: OAuthProvider; userId: string; workspaceId: string } = JSON.parse(
      decodeURIComponent(raw),
    );
    const left = Buffer.from(saved.state);
    const right = Buffer.from(state);
    return (
      saved.provider === provider &&
      saved.userId === userId &&
      saved.workspaceId === workspaceId &&
      left.length === right.length &&
      timingSafeEqual(left, right)
    );
  } catch {
    return false;
  }
}

export function clearOAuth(response: NextResponse) {
  response.cookies.set(cookieName, "", { path: "/api/email-accounts/callback", maxAge: 0 });
  return response;
}
