import "server-only";

import { webhookConfigSchema } from "./config";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function publicWebhookAddress(address: string) {
  if (isIP(address) === 6)
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2002:/i.test(address) && !/^2001:(?:db8|0|10|20):/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function webhookUrl(value: string) {
  const url = new URL(value);
  const allowed = (process.env.WORKFLOW_WEBHOOK_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !allowed.includes(url.hostname.toLowerCase())
  )
    throw new Error("Webhook must use HTTPS on an administrator-allowlisted host (port 443).");
  return url;
}
export async function postWorkflowWebhook(
  value: string,
  payload: unknown,
  idempotencyKey: string,
  options: { method?: string; headers?: Record<string, string> } = {},
) {
  const config = webhookConfigSchema.parse({ url: value, ...options });
  const url = webhookUrl(value);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((result) => !publicWebhookAddress(result.address)))
    throw new Error("Webhook resolved to a non-public address.");
  const pinned = addresses[0];
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body) > 65536) throw new Error("Webhook payload too large.");
  return new Promise<number>((resolve, reject) => {
    // Pin the validated DNS result, disallow redirects, and bound connection + response time.
    const outgoing = request(
      url,
      {
        method: config.method,
        agent: false,
        family: pinned.family,
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: {
          ...config.headers,
          "Content-Type": "application/json",
          ...(config.method !== "GET" ? { "Content-Length": Buffer.byteLength(body) } : {}),
          "Idempotency-Key": idempotencyKey,
        },
      },
      (response) => {
        let bytes = 0;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 65536) outgoing.destroy(new Error("Webhook response too large."));
        });
        response.on("error", reject);
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve(status);
          else reject(new Error(`Webhook returned HTTP ${status}.`));
        });
      },
    );
    const timer = setTimeout(() => outgoing.destroy(new Error("Webhook timed out.")), 10000);
    outgoing.once("close", () => clearTimeout(timer));
    outgoing.once("error", reject);
    outgoing.end(config.method === "GET" ? undefined : body);
  });
}
