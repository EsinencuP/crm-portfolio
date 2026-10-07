import "server-only";

import { Client } from "@microsoft/microsoft-graph-client";

const scopes = "offline_access Mail.ReadWrite Mail.Send User.Read";
const base = "https://login.microsoftonline.com/common/oauth2/v2.0";

function config() {
  if (!process.env.OUTLOOK_CLIENT_ID || !process.env.OUTLOOK_CLIENT_SECRET)
    throw new Error("Outlook OAuth is not configured");
  return { clientId: process.env.OUTLOOK_CLIENT_ID, secret: process.env.OUTLOOK_CLIENT_SECRET };
}

export function graphClient(accessToken: string) {
  return Client.init({ authProvider: (done) => done(null, accessToken) });
}

export function initOutlookOAuthUrl(redirectUri: string, state: string) {
  const { clientId } = config();
  const url = new URL(`${base}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: scopes,
    state,
  }).toString();
  return url.toString();
}

async function redeem(params: URLSearchParams) {
  const { clientId, secret } = config();
  params.set("client_id", clientId);
  params.set("client_secret", secret);
  params.set("scope", scopes);
  const response = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Outlook authorization failed");
  const result: { access_token?: string; refresh_token?: string; expires_in?: number } = await response.json();
  if (!result.access_token) throw new Error("Outlook did not return an access token");
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (result.expires_in ?? 3600) * 1000),
  };
}

export async function exchangeOutlookCode(code: string, redirectUri: string) {
  const tokens = await redeem(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
  const profile: { mail?: string; userPrincipalName?: string; displayName?: string } = await graphClient(
    tokens.accessToken,
  )
    .api("/me")
    .select("mail,userPrincipalName,displayName")
    .get();
  const email = profile.mail ?? profile.userPrincipalName;
  if (!email) throw new Error("Outlook did not return an email address");
  return { ...tokens, email: email.toLowerCase(), displayName: profile.displayName ?? null };
}

export async function refreshOutlookToken(refreshToken: string) {
  return redeem(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}
