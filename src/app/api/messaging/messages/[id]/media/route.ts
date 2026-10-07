import { conversationAccessWhere, messagingActor, messagingHeaders } from "@/lib/messaging/access";
import { decryptMessagingSecret } from "@/lib/messaging/security";
import { telegramRequest } from "@/lib/messaging/telegram";
import { whatsappRequest } from "@/lib/messaging/whatsapp";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const message = await prisma.messagingMessage.findFirst({
    where: { id: (await params).id, conversation: await conversationAccessWhere(actor.member) },
    include: { conversation: { include: { channel: true } } },
  });
  if (!message?.mediaId || !message.conversation.channel.accessToken)
    return new Response("Attachment not found.", { status: 404, headers: messagingHeaders });
  try {
    const channel = message.conversation.channel;
    const token = decryptMessagingSecret(channel.accessToken ?? "");
    let url: string;
    const headers: Record<string, string> = {};
    if (channel.platform === "TELEGRAM") {
      const file = await telegramRequest<{ file_path?: string; file_size?: number }>(token, "getFile", {
        file_id: message.mediaId,
      });
      if (
        !file.file_path ||
        !/^[\w./-]+$/.test(file.file_path) ||
        file.file_path.split("/").includes("..") ||
        (file.file_size ?? 0) > 20_000_000
      )
        return new Response("Attachment unavailable or too large.", { status: 413, headers: messagingHeaders });
      url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    } else {
      const media = await whatsappRequest<{ url: string; file_size?: number }>(
        token,
        encodeURIComponent(message.mediaId),
      );
      const parsed = new URL(media.url);
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !["fbcdn.net", "fbsbx.com", "facebook.com"].some(
          (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
        ) ||
        (media.file_size ?? 0) > 20_000_000
      )
        return new Response("Attachment unavailable or too large.", { status: 413, headers: messagingHeaders });
      url = parsed.toString();
      headers.Authorization = `Bearer ${token}`;
    }
    const upstream = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok || Number(upstream.headers.get("content-length")) > 20_000_000)
      return new Response("Attachment unavailable.", { status: 502, headers: messagingHeaders });
    return new Response(upstream.body, {
      headers: {
        ...messagingHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Attachment unavailable.", { status: 502, headers: messagingHeaders });
  }
}
