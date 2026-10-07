import "server-only";

import { z } from "zod";

import { activeMessagingChannel, decryptMessagingSecret } from "@/lib/messaging/security";
import type { IncomingMessage } from "@/lib/messaging/types";

export async function telegramRequest<T>(token: string, method: string, body: unknown): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result: { ok?: boolean; result?: T } = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.result)
    throw new Error("Telegram request failed. Check the bot token and chat permissions.");
  return result.result;
}
async function send(channelId: string, chatId: string, method: string, payload: unknown) {
  if (!/^\d{1,20}$/.test(chatId)) throw new Error("Only private Telegram chats are supported.");
  const channel = await activeMessagingChannel(channelId, "TELEGRAM");
  const result = await telegramRequest<{ message_id: number }>(
    decryptMessagingSecret(channel.accessToken ?? ""),
    method,
    { chat_id: chatId, ...(payload as Record<string, unknown>) },
  );
  if (!Number.isSafeInteger(result.message_id)) throw new Error("Telegram did not confirm the message.");
  return { externalId: `${chatId}:${result.message_id}` };
}
export async function sendTelegramMessage(channelId: string, chatId: string, text: string) {
  return send(channelId, chatId, "sendMessage", { text });
}
export async function sendTelegramPhoto(channelId: string, chatId: string, photoUrl: string, caption: string) {
  return send(channelId, chatId, "sendPhoto", { photo: photoUrl, caption });
}
const file = z.object({ file_id: z.string().min(1).max(512) });
const user = z.object({ id: z.number().int().safe(), first_name: z.string(), last_name: z.string().optional() });
const updateSchema = z.object({
  update_id: z.number().int().safe(),
  message: z
    .object({
      message_id: z.number().int().safe(),
      date: z.number().int().nonnegative(),
      chat: z.object({ id: z.number().int().safe(), type: z.string() }),
      from: user.optional(),
      text: z.string().max(10_000).optional(),
      caption: z.string().max(10_000).optional(),
      photo: z.array(file).max(20).optional(),
      video: file.optional(),
      document: file.optional(),
      audio: file.optional(),
      voice: file.optional(),
      sticker: file.optional(),
      contact: z.object({ phone_number: z.string(), user_id: z.number().int().safe().optional() }).optional(),
    })
    .optional(),
});
export function parseTelegramWebhook(body: unknown): IncomingMessage | null {
  const message = updateSchema.parse(body).message;
  if (message?.chat.type !== "private" || !message.from || message.chat.id !== message.from.id) return null;
  const media =
    message.photo?.at(-1) ?? message.video ?? message.document ?? message.audio ?? message.voice ?? message.sticker;
  let mediaType: string | null = null;
  if (message.photo || message.sticker) mediaType = "image";
  else if (message.video) mediaType = "video";
  else if (message.document) mediaType = "document";
  else if (message.audio || message.voice) mediaType = "audio";
  const ownContact = message.contact?.user_id === message.from.id ? message.contact.phone_number : null;
  const sentAt = new Date(message.date * 1000);
  if (!Number.isFinite(sentAt.getTime())) return null;
  let content = message.text ?? message.caption ?? null;
  if (content === null && message.contact) content = "Contact details shared";
  else if (content === null && !media) content = "[Unsupported Telegram message]";
  return {
    channelExternalId: "",
    externalId: `${message.chat.id}:${message.message_id}`,
    sender: String(message.chat.id),
    senderName: [message.from.first_name, message.from.last_name].filter(Boolean).join(" "),
    phone: ownContact,
    telegramUserId: String(message.from.id),
    content,
    mediaId: media?.file_id ?? null,
    mediaType,
    sentAt,
  };
}
