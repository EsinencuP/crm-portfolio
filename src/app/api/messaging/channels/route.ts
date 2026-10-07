import { type MessagingChannel, Prisma } from "@prisma/client";
import { z } from "zod";

import { channelSelect, messagingActor, messagingHeaders } from "@/lib/messaging/access";
import { encryptMessagingSecret, messagingWebhookUrl } from "@/lib/messaging/security";
import { telegramRequest } from "@/lib/messaging/telegram";
import { whatsappRequest } from "@/lib/messaging/whatsapp";
import { isWorkspaceAdmin } from "@/lib/permissions";
import prisma from "@/lib/prisma";

import { createHash, randomBytes } from "node:crypto";

export const runtime = "nodejs";
const config = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("WHATSAPP"),
    channelName: z.string().trim().min(1).max(100),
    phoneNumberId: z.string().regex(/^\d{5,30}$/),
    accessToken: z.string().min(10).max(4096),
    verifyToken: z.string().min(16).max(256).optional(),
  }),
  z.object({
    platform: z.literal("TELEGRAM"),
    channelName: z.string().trim().min(1).max(100),
    botToken: z
      .string()
      .regex(/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/)
      .optional(),
  }),
]);
export async function GET() {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  if (!isWorkspaceAdmin(actor.member.role))
    return Response.json({ error: "Workspace administrator required." }, { status: 403, headers: messagingHeaders });
  const channels = await prisma.messagingChannel.findMany({
    where: { workspaceId: actor.member.workspaceId },
    select: channelSelect,
    orderBy: { createdAt: "asc" },
  });
  return Response.json(
    {
      channels: channels.map((channel) => {
        let webhookUrl: string | null = null;
        try {
          webhookUrl = messagingWebhookUrl(channel.platform, channel.id);
        } catch {
          /* Configure the public origin before connecting. */
        }
        return { ...channel, webhookUrl };
      }),
    },
    { headers: messagingHeaders },
  );
}
export async function POST(request: Request) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  if (!isWorkspaceAdmin(actor.member.role))
    return Response.json({ error: "Workspace administrator required." }, { status: 403, headers: messagingHeaders });
  const parsed = config.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "Enter a valid name, provider credentials and verification token (16+ characters)." },
      { status: 400, headers: messagingHeaders },
    );
  const input = parsed.data;
  let token: string;
  let webhookSecret: string;
  let channelId: string;
  let phoneNumber: string | null = null;
  let botUsername: string | null = null;
  try {
    messagingWebhookUrl(input.platform, "configuration-check");
    encryptMessagingSecret("configuration-check");
  } catch {
    return Response.json(
      { error: "Configure MESSAGING_TOKEN_ENCRYPTION_KEY and a public HTTPS MESSAGING_WEBHOOK_BASE_URL." },
      { status: 503, headers: messagingHeaders },
    );
  }
  try {
    if (input.platform === "WHATSAPP") {
      if (!process.env.WHATSAPP_APP_SECRET)
        return Response.json(
          { error: "Configure WHATSAPP_APP_SECRET for signed webhooks." },
          { status: 503, headers: messagingHeaders },
        );
      token = input.accessToken;
      webhookSecret = input.verifyToken ?? process.env.WHATSAPP_VERIFY_TOKEN ?? "";
      if (webhookSecret.length < 16)
        return Response.json(
          { error: "Provide a verification token of at least 16 characters." },
          { status: 400, headers: messagingHeaders },
        );
      const phone = await whatsappRequest<{ id: string; display_phone_number?: string }>(
        token,
        `${input.phoneNumberId}?fields=id,display_phone_number`,
      );
      if (phone.id !== input.phoneNumberId) throw new Error("Phone number verification failed.");
      channelId = phone.id;
      phoneNumber = phone.display_phone_number ?? null;
    } else {
      token = input.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
      if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token))
        return Response.json(
          { error: "Provide a valid Telegram Bot Token." },
          { status: 400, headers: messagingHeaders },
        );
      const bot = await telegramRequest<{ id: number; is_bot: boolean; username?: string }>(token, "getMe", {});
      if (!bot.is_bot || !Number.isSafeInteger(bot.id) || !bot.username) throw new Error("Bot verification failed.");
      // Stable identity survives token rotation and prevents cross-workspace bot takeover.
      channelId = createHash("sha256").update(`telegram:${bot.id}`).digest("hex");
      botUsername = bot.username;
      webhookSecret = randomBytes(32).toString("base64url");
    }
  } catch {
    return Response.json(
      { error: "Provider authorization failed. Check credentials, permissions and the WhatsApp API version." },
      { status: 502, headers: messagingHeaders },
    );
  }
  const existing = await prisma.messagingChannel.findUnique({
    where: { platform_channelId: { platform: input.platform, channelId } },
  });
  if (existing && existing.workspaceId !== actor.member.workspaceId)
    return Response.json(
      { error: "This provider account is connected to another workspace." },
      { status: 409, headers: messagingHeaders },
    );
  let channel: MessagingChannel;
  try {
    const data = {
      channelName: input.channelName,
      phoneNumber,
      botUsername,
      accessToken: encryptMessagingSecret(token),
      webhookSecret: encryptMessagingSecret(webhookSecret),
      isActive: input.platform === "WHATSAPP",
    };
    channel = existing
      ? await prisma.messagingChannel.update({
          where: { id: existing.id, workspaceId: actor.member.workspaceId },
          data,
        })
      : await prisma.messagingChannel.create({
          data: { ...data, platform: input.platform, channelId, workspaceId: actor.member.workspaceId },
        });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json(
        { error: "This account was already connected. Refresh the channel list." },
        { status: 409, headers: messagingHeaders },
      );
    throw error;
  }
  const webhookUrl = messagingWebhookUrl(input.platform, channel.id);
  if (input.platform === "TELEGRAM") {
    try {
      await telegramRequest<boolean>(token, "setWebhook", {
        url: webhookUrl,
        secret_token: webhookSecret,
        allowed_updates: ["message"],
      });
      await prisma.messagingChannel.update({ where: { id: channel.id }, data: { isActive: true } });
    } catch {
      return Response.json(
        { error: "Channel saved but webhook registration failed. Activate it to retry.", channelId: channel.id },
        { status: 502, headers: messagingHeaders },
      );
    }
  }
  const safe = await prisma.messagingChannel.findUniqueOrThrow({ where: { id: channel.id }, select: channelSelect });
  return Response.json({ channel: { ...safe, webhookUrl } }, { status: 201, headers: messagingHeaders });
}
