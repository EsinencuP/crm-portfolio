import "server-only";

import type { MessagingChannel } from "@prisma/client";

import prisma from "@/lib/prisma";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey() {
  const key = Buffer.from(process.env.MESSAGING_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("Set MESSAGING_TOKEN_ENCRYPTION_KEY to 32 base64-encoded random bytes.");
  return key;
}
export function encryptMessagingSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
export function decryptMessagingSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid messaging credentials.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}
export function secretEquals(left: string, right: string) {
  return timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
}
export function verifyWhatsAppSignature(raw: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return secretEquals(signature, `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
}
export function messagingWebhookUrl(platform: "WHATSAPP" | "TELEGRAM", channelId: string) {
  const url = new URL(process.env.MESSAGING_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("Set a public HTTPS messaging webhook origin.");
  return `${url.origin}/api/webhooks/${platform.toLowerCase()}?channelId=${encodeURIComponent(channelId)}`;
}
export async function activeMessagingChannel(id: string, platform: MessagingChannel["platform"]) {
  const channel = await prisma.messagingChannel.findFirst({ where: { id, platform, isActive: true } });
  if (!channel?.accessToken) throw new Error("Messaging channel is unavailable.");
  return channel;
}
export async function readWebhookBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("JSON required.");
  if (Number(request.headers.get("content-length")) > 262_144) throw new Error("Webhook too large.");
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 262_144) throw new Error("Webhook too large.");
  return raw;
}
