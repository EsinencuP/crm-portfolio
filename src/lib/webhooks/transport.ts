import "server-only";

import { publicWebhookAddress } from "@/lib/workflows/webhook";

import { outboundWebhookUrl } from "./security";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

export type WebhookResponse = { status: number; body: string; duration: number };
export async function postWebhook(
  urlValue: string,
  body: string,
  headers: Record<string, string>,
): Promise<WebhookResponse> {
  const started = Date.now();
  const url = outboundWebhookUrl(urlValue);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }),
    new Promise<never>((_resolve, reject) => {
      dnsTimer = setTimeout(() => reject(new Error("DNS lookup timed out.")), 10000);
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((address) => !publicWebhookAddress(address.address)))
    throw new Error("Endpoint resolves to a non-public IP address.");
  const pinned = addresses[0];
  const remaining = 10000 - (Date.now() - started);
  if (remaining <= 0) throw new Error("Webhook timed out.");
  return new Promise<WebhookResponse>((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: "POST",
        agent: false,
        family: pinned.family,
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
        headers: { ...headers, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (response) => {
        let received = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > 65536) {
            outgoing.destroy(new Error("Response body exceeds 64 KiB."));
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8").slice(0, 2000),
            duration: Date.now() - started,
          }),
        );
      },
    );
    const timer = setTimeout(() => outgoing.destroy(new Error("Webhook timed out.")), remaining);
    outgoing.once("close", () => clearTimeout(timer));
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}
