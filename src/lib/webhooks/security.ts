import "server-only";

import { publicWebhookAddress } from "@/lib/workflows/webhook";

import { customHeadersSchema } from "./config";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

function encryptionKey() {
  const value = Buffer.from(process.env.WEBHOOK_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (value.length !== 32) throw new Error("Configure WEBHOOK_TOKEN_ENCRYPTION_KEY as 32 base64-encoded random bytes.");
  return value;
}
export function sealWebhookSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encoded = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encoded.toString("base64url")}`;
}
export function unsealWebhookSecret(value: string) {
  const [version, iv, tag, body] = value.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Invalid encrypted webhook credentials.");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(body, "base64url")), cipher.final()]).toString("utf8");
}
export function sealWebhookHeaders(headers: Record<string, string>) {
  return { encrypted: sealWebhookSecret(JSON.stringify(customHeadersSchema.parse(headers))) };
}
export function unsealWebhookHeaders(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value !== "object" || !("encrypted" in value) || typeof value.encrypted !== "string")
    throw new Error("Invalid encrypted webhook headers.");
  return customHeadersSchema.parse(JSON.parse(unsealWebhookSecret(value.encrypted)));
}
export function webhookSignature(body: string, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}
export function outboundWebhookUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allowed = (process.env.WEBHOOK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.hash ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    (isIP(host) && !publicWebhookAddress(host)) ||
    (allowed.length && !allowed.includes(url.hostname.toLowerCase()))
  )
    throw new Error(
      "Use a public HTTPS endpoint on port 443, without credentials/fragments, permitted by WEBHOOK_ALLOWED_HOSTS.",
    );
  return url;
}
