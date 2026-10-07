import { receiveMessage } from "@/lib/messaging/receive";
import { decryptMessagingSecret, readWebhookBody, secretEquals } from "@/lib/messaging/security";
import { parseTelegramWebhook } from "@/lib/messaging/telegram";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      id: new URL(request.url).searchParams.get("channelId") ?? "",
      platform: "TELEGRAM",
    },
  });
  if (!channel?.webhookSecret) return new Response("Unknown channel.", { status: 404 });
  try {
    if (
      !secretEquals(
        request.headers.get("x-telegram-bot-api-secret-token") ?? "",
        decryptMessagingSecret(channel.webhookSecret),
      )
    )
      return new Response("Invalid webhook secret.", { status: 403 });
  } catch {
    return new Response("Webhook authentication unavailable.", { status: 503 });
  }
  if (!channel.isActive) return new Response(null, { status: 204 });
  let incoming: ReturnType<typeof parseTelegramWebhook>;
  try {
    incoming = parseTelegramWebhook(JSON.parse(await readWebhookBody(request)));
  } catch {
    return new Response("Invalid payload.", { status: 400 });
  }
  if (incoming) await receiveMessage(channel, incoming);
  return new Response(null, { status: 204 });
}
