import { receiveMessage } from "@/lib/messaging/receive";
import {
  decryptMessagingSecret,
  readWebhookBody,
  secretEquals,
  verifyWhatsAppSignature,
} from "@/lib/messaging/security";
import { parseWhatsAppWebhook } from "@/lib/messaging/whatsapp";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const channel = await prisma.messagingChannel.findFirst({
    where: { id: query.get("channelId") ?? "", platform: "WHATSAPP", isActive: true },
  });
  try {
    if (
      query.get("hub.mode") !== "subscribe" ||
      !channel?.webhookSecret ||
      !secretEquals(query.get("hub.verify_token") ?? "", decryptMessagingSecret(channel.webhookSecret))
    )
      return new Response("Verification failed.", { status: 403 });
    const challenge = query.get("hub.challenge");
    if (!challenge || challenge.length > 256) return new Response("Invalid challenge.", { status: 400 });
    return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
  } catch {
    return new Response("Verification unavailable.", { status: 503 });
  }
}
export async function POST(request: Request) {
  let raw: string;
  try {
    raw = await readWebhookBody(request);
  } catch {
    return new Response("Invalid webhook body.", { status: 400 });
  }
  if (!process.env.WHATSAPP_APP_SECRET) return new Response("WhatsApp webhooks are not configured.", { status: 503 });
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256")))
    return new Response("Invalid signature.", { status: 403 });
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      id: new URL(request.url).searchParams.get("channelId") ?? "",
      platform: "WHATSAPP",
    },
  });
  if (!channel) return new Response("Unknown channel.", { status: 404 });
  if (!channel.isActive) return new Response(null, { status: 204 });
  let parsed: ReturnType<typeof parseWhatsAppWebhook>;
  try {
    parsed = parseWhatsAppWebhook(JSON.parse(raw));
  } catch {
    return new Response("Invalid payload.", { status: 400 });
  }
  for (const message of parsed.messages) {
    if (message.channelExternalId !== channel.channelId) continue;
    await receiveMessage(channel, message);
  }
  for (const event of parsed.statuses) {
    if (event.channelExternalId !== channel.channelId) continue;
    const states = {
      SENT: ["PENDING"],
      DELIVERED: ["PENDING", "SENT"],
      READ: ["PENDING", "SENT", "DELIVERED"],
      FAILED: ["PENDING", "SENT"],
    } as const;
    await prisma.messagingMessage.updateMany({
      where: {
        externalId: event.externalId,
        direction: "OUTBOUND",
        conversation: { channelId: channel.id },
        status: { in: [...states[event.status]] },
      },
      data: {
        status: event.status,
        ...(event.status === "DELIVERED" && { deliveredAt: event.at }),
        ...(event.status === "READ" && { readAt: event.at }),
      },
    });
  }
  return new Response(null, { status: 204 });
}
