import { NextResponse } from "next/server";

import { EmailProvider } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { initGmailOAuthUrl } from "@/lib/email/gmail-client";
import { createOAuthState, emailRedirectUri, startOAuth } from "@/lib/email/oauth-flow";
import { initOutlookOAuthUrl } from "@/lib/email/outlook-client";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first" }, { status: 409, headers });
  const accounts = await prisma.emailAccount.findMany({
    where: { userId: user.id, workspaceId: member.workspaceId },
    select: {
      id: true,
      provider: true,
      email: true,
      displayName: true,
      syncEnabled: true,
      lastSyncAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ accounts }, { headers });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in" }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first" }, { status: 409, headers });
  const parsed = z
    .object({ provider: z.enum([EmailProvider.GMAIL, EmailProvider.OUTLOOK]) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid provider" }, { status: 400, headers });
  try {
    const provider = parsed.data.provider;
    const state = createOAuthState();
    const redirectUri = emailRedirectUri(provider);
    const authUrl =
      provider === "GMAIL" ? initGmailOAuthUrl(redirectUri, state) : initOutlookOAuthUrl(redirectUri, state);
    const response = NextResponse.json({ authUrl }, { headers });
    startOAuth(response, state, provider, user.id, member.workspaceId);
    return response;
  } catch {
    return Response.json({ error: "Email OAuth is not configured" }, { status: 503, headers });
  }
}
