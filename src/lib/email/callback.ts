import "server-only";

import { NextResponse } from "next/server";

import type { EmailProvider } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth-utils";
import { exchangeGmailCode } from "@/lib/email/gmail-client";
import { clearOAuth, emailRedirectUri, validateOAuth } from "@/lib/email/oauth-flow";
import { exchangeOutlookCode } from "@/lib/email/outlook-client";
import { encryptToken } from "@/lib/email/tokens";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export async function handleEmailCallback(request: Request, provider: "GMAIL" | "OUTLOOK") {
  const resultUrl = new URL("/dashboard/settings/email", emailRedirectUri(provider));
  const finish = (status: string) => {
    resultUrl.searchParams.set("status", status);
    return clearOAuth(NextResponse.redirect(resultUrl));
  };
  const user = await getCurrentUser();
  if (!user) return finish("auth_required");
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return finish("workspace_required");
  const params = new URL(request.url).searchParams;
  if (params.has("error")) return finish("denied");
  if (!validateOAuth(request, provider, user.id, member.workspaceId, params.get("state")))
    return finish("invalid_state");
  const code = params.get("code");
  if (!code) return finish("missing_code");
  try {
    const tokens =
      provider === "GMAIL"
        ? await exchangeGmailCode(code, emailRedirectUri(provider))
        : await exchangeOutlookCode(code, emailRedirectUri(provider));
    const existing = await prisma.emailAccount.findUnique({
      where: { email_workspaceId: { email: tokens.email, workspaceId: member.workspaceId } },
    });
    if (existing && existing.userId !== user.id) return finish("already_connected");
    if (!tokens.refreshToken && !existing?.refreshToken) return finish("no_refresh_token");
    const data = {
      provider: provider as EmailProvider,
      displayName: tokens.displayName,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : existing?.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      syncEnabled: true,
      ...(existing?.provider !== provider ? { syncCursor: null, lastSyncAt: null } : {}),
    };
    await prisma.emailAccount.upsert({
      where: { email_workspaceId: { email: tokens.email, workspaceId: member.workspaceId } },
      create: { ...data, email: tokens.email, userId: user.id, workspaceId: member.workspaceId },
      update: data,
    });
    return finish("connected");
  } catch {
    return finish("connection_failed");
  }
}
