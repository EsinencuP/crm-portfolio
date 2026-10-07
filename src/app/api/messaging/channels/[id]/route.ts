import { z } from "zod";

import { messagingActor, messagingHeaders } from "@/lib/messaging/access";
import { decryptMessagingSecret, messagingWebhookUrl } from "@/lib/messaging/security";
import { telegramRequest } from "@/lib/messaging/telegram";
import { isWorkspaceAdmin } from "@/lib/permissions";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  if (!isWorkspaceAdmin(actor.member.role))
    return Response.json({ error: "Workspace administrator required." }, { status: 403, headers: messagingHeaders });
  const parsed = z.strictObject({ isActive: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Choose active or paused." }, { status: 400, headers: messagingHeaders });
  const channel = await prisma.messagingChannel.findFirst({
    where: { id: (await params).id, workspaceId: actor.member.workspaceId },
  });
  if (!channel) return Response.json({ error: "Channel not found." }, { status: 404, headers: messagingHeaders });
  if (parsed.data.isActive && channel.platform === "TELEGRAM") {
    try {
      if (!channel.accessToken || !channel.webhookSecret) throw new Error("Reconnect the bot.");
      await telegramRequest<boolean>(decryptMessagingSecret(channel.accessToken), "setWebhook", {
        url: messagingWebhookUrl(channel.platform, channel.id),
        secret_token: decryptMessagingSecret(channel.webhookSecret),
        allowed_updates: ["message"],
      });
    } catch {
      return Response.json(
        { error: "Could not register the Telegram webhook. Reconnect the bot." },
        { status: 502, headers: messagingHeaders },
      );
    }
  }
  await prisma.messagingChannel.update({
    where: { id: channel.id, workspaceId: actor.member.workspaceId },
    data: parsed.data,
  });
  return Response.json({ success: true }, { headers: messagingHeaders });
}
