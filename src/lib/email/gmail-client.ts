import "server-only";

import { google } from "googleapis";

const scopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

function oauthClient(redirectUri: string) {
  if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET)
    throw new Error("Gmail OAuth is not configured");
  return new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, redirectUri);
}

export function initGmailOAuthUrl(redirectUri: string, state: string) {
  return oauthClient(redirectUri).generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopes, state });
}

export async function exchangeGmailCode(code: string, redirectUri: string) {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("Gmail did not return an access token");
  client.setCredentials(tokens);
  const profile = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  if (!profile.data.email) throw new Error("Gmail did not return an email address");
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    email: profile.data.email.toLowerCase(),
    displayName: profile.data.name ?? null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export async function refreshGmailToken(refreshToken: string) {
  const client = oauthClient("");
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) throw new Error("Gmail token refresh failed");
  return {
    accessToken: credentials.access_token,
    expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3_000_000),
    refreshToken: credentials.refresh_token ?? null,
  };
}
