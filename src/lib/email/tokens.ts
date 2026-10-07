import "server-only";

import type { EmailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const encoded = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!encoded) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY is not configured");
  const secret = Buffer.from(encoded, "base64");
  if (secret.length !== 32) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY must be 32 base64-encoded bytes");
  return secret;
}

export function encryptToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export async function accessTokenFor(account: EmailAccount) {
  if (account.accessToken && account.tokenExpiresAt && account.tokenExpiresAt.getTime() > Date.now() + 60_000)
    return decryptToken(account.accessToken);
  if (!account.refreshToken) throw new Error("Reconnect the email account to refresh authorization");
  const refreshToken = decryptToken(account.refreshToken);
  let tokens: { accessToken: string; expiresAt: Date; refreshToken: string | null } | null = null;
  if (account.provider === "GMAIL") tokens = await (await import("./gmail-client")).refreshGmailToken(refreshToken);
  else if (account.provider === "OUTLOOK")
    tokens = await (await import("./outlook-client")).refreshOutlookToken(refreshToken);
  else tokens = null;
  if (!tokens) throw new Error("Unsupported email provider");
  await prisma.emailAccount.updateMany({
    where: { id: account.id, userId: account.userId, workspaceId: account.workspaceId },
    data: {
      accessToken: encryptToken(tokens.accessToken),
      tokenExpiresAt: tokens.expiresAt,
      ...(tokens.refreshToken ? { refreshToken: encryptToken(tokens.refreshToken) } : {}),
    },
  });
  return tokens.accessToken;
}
