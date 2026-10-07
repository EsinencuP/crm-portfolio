import "server-only";

import { z } from "zod";

import { activeMessagingChannel, decryptMessagingSecret } from "@/lib/messaging/security";
import type { IncomingMessage } from "@/lib/messaging/types";

export function whatsappApiUrl(path: string) {
  const version = process.env.WHATSAPP_API_VERSION;
  if (!version || !/^v\d+\.\d+$/.test(version))
    throw new Error("Set WHATSAPP_API_VERSION to a supported Graph API version.");
  return `https://graph.facebook.com/${version}/${path}`;
}
export async function whatsappRequest<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(whatsappApiUrl(path), {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("WhatsApp request failed. Check token, permissions and the reply window.");
  return response.json();
}
async function send(channelId: string, to: string, payload: Record<string, unknown>) {
  if (!/^\d{8,15}$/.test(to)) throw new Error("Invalid WhatsApp recipient.");
  const channel = await activeMessagingChannel(channelId, "WHATSAPP");
  const result = await whatsappRequest<{ messages?: { id: string }[] }>(
    decryptMessagingSecret(channel.accessToken ?? ""),
    `${channel.channelId}/messages`,
    { messaging_product: "whatsapp", recipient_type: "individual", to, ...payload },
  );
  const id = result.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp did not confirm the message.");
  return { externalId: id };
}
export async function sendWhatsAppMessage(channelId: string, to: string, text: string) {
  return send(channelId, to, { type: "text", text: { body: text, preview_url: false } });
}
export async function sendWhatsAppImage(channelId: string, to: string, url: string, caption: string) {
  return send(channelId, to, { type: "image", image: { link: url, ...(caption && { caption }) } });
}
export async function sendWhatsAppTemplate(
  channelId: string,
  to: string,
  templateName: string,
  params: string[],
  language = "en_US",
) {
  return send(channelId, to, {
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(params.length && {
        components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
      }),
    },
  });
}

const messageSchema = z.object({
  from: z.string().regex(/^\d{8,15}$/),
  id: z.string().min(1).max(256),
  timestamp: z.string().regex(/^\d{1,12}$/),
  type: z.string().max(40),
  text: z.object({ body: z.string().max(10_000) }).optional(),
  image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
  video: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
  document: z.object({ id: z.string(), caption: z.string().optional(), filename: z.string().optional() }).optional(),
  audio: z.object({ id: z.string() }).optional(),
  sticker: z.object({ id: z.string() }).optional(),
  button: z.object({ text: z.string() }).optional(),
  interactive: z
    .object({
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional(),
    })
    .optional(),
});
const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string().regex(/^\d+$/) }).optional(),
  contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }) })).optional(),
  messages: z.array(messageSchema).max(100).optional(),
  statuses: z
    .array(
      z.object({
        id: z.string().min(1),
        status: z.enum(["sent", "delivered", "read", "failed"]),
        timestamp: z.string().regex(/^\d{1,12}$/),
      }),
    )
    .max(100)
    .optional(),
});
const webhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: valueSchema })) })).max(100),
});

export function parseWhatsAppWebhook(body: unknown) {
  const data = webhookSchema.parse(body);
  const messages: IncomingMessage[] = [];
  const statuses: {
    channelExternalId: string;
    externalId: string;
    status: "SENT" | "DELIVERED" | "READ" | "FAILED";
    at: Date;
  }[] = [];
  for (const entry of data.entry)
    for (const change of entry.changes) {
      const value = change.value;
      if (change.field !== "messages" || !value.metadata) continue;
      for (const item of value.messages ?? []) {
        const media = item.image ?? item.video ?? item.document ?? item.audio ?? item.sticker;
        const content =
          item.text?.body ??
          item.button?.text ??
          item.interactive?.button_reply?.title ??
          item.interactive?.list_reply?.title ??
          item.image?.caption ??
          item.video?.caption ??
          item.document?.caption ??
          (media ? null : `[${item.type} message]`);
        const sentAt = new Date(Number(item.timestamp) * 1000);
        if (!Number.isFinite(sentAt.getTime())) continue;
        let mediaType = media ? item.type : null;
        if (mediaType === "sticker") mediaType = "image";
        messages.push({
          channelExternalId: value.metadata.phone_number_id,
          externalId: item.id,
          sender: item.from,
          senderName: value.contacts?.find((contact) => contact.wa_id === item.from)?.profile.name ?? null,
          phone: `+${item.from}`,
          content,
          mediaId: media?.id ?? null,
          mediaType,
          sentAt,
        });
      }
      for (const status of value.statuses ?? []) {
        const at = new Date(Number(status.timestamp) * 1000);
        if (Number.isFinite(at.getTime()))
          statuses.push({
            channelExternalId: value.metadata.phone_number_id,
            externalId: status.id,
            status: status.status.toUpperCase() as "SENT" | "DELIVERED" | "READ" | "FAILED",
            at,
          });
      }
    }
  return { messages, statuses };
}
