import { type MessagingMessage, Prisma } from "@prisma/client";
import { z } from "zod";

import { accessibleConversation, canWriteConversation, messagingActor, messagingHeaders } from "@/lib/messaging/access";
import { sendTelegramMessage, sendTelegramPhoto } from "@/lib/messaging/telegram";
import { sendWhatsAppImage, sendWhatsAppMessage, sendWhatsAppTemplate } from "@/lib/messaging/whatsapp";
import prisma from "@/lib/prisma";

import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const pagination = z.object({
  before: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const input = z
  .strictObject({
    content: z.string().trim().max(4096).default(""),
    mediaUrl: z
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      })
      .optional(),
    requestId: z.uuid().optional(),
    template: z
      .object({
        name: z.string().regex(/^[a-z0-9_]{1,512}$/),
        language: z
          .string()
          .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/)
          .default("en_US"),
        params: z.array(z.string().max(1000)).max(20).default([]),
      })
      .optional(),
  })
  .refine(
    (value) =>
      (Boolean(value.content) || Boolean(value.mediaUrl) || Boolean(value.template)) &&
      !(value.mediaUrl && value.template) &&
      (!value.mediaUrl || value.content.length <= 1024),
  );

export async function GET(request: Request, { params }: Context) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const conversation = await accessibleConversation((await params).id, actor.member);
  if (!conversation)
    return Response.json({ error: "Conversation not found." }, { status: 404, headers: messagingHeaders });
  const parsed = pagination.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json({ error: "Invalid message page." }, { status: 400, headers: messagingHeaders });
  const { before, limit } = parsed.data;
  const cursor = before
    ? await prisma.messagingMessage.findFirst({ where: { id: before, conversationId: conversation.id } })
    : null;
  if (before && !cursor)
    return Response.json({ error: "Invalid message cursor." }, { status: 400, headers: messagingHeaders });
  const messages = await prisma.messagingMessage.findMany({
    where: {
      conversationId: conversation.id,
      ...(cursor && { OR: [{ sentAt: { lt: cursor.sentAt } }, { sentAt: cursor.sentAt, id: { lt: cursor.id } }] }),
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const more = messages.length > limit;
  const items = messages.slice(0, limit);
  return Response.json({ messages: items, nextCursor: more ? items.at(-1)?.id : null }, { headers: messagingHeaders });
}
export async function POST(request: Request, { params }: Context) {
  const actor = await messagingActor();
  if (actor.error) return actor.error;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error:
          "Enter text (up to 4096 characters), an HTTPS image URL or a template. Image captions allow 1024 characters.",
      },
      { status: 400, headers: messagingHeaders },
    );
  const conversation = await accessibleConversation((await params).id, actor.member);
  if (!conversation)
    return Response.json({ error: "Conversation not found." }, { status: 404, headers: messagingHeaders });
  if (!(await canWriteConversation(actor.member, conversation)))
    return Response.json({ error: "Edit access required." }, { status: 403, headers: messagingHeaders });
  if (!conversation.channel.isActive)
    return Response.json({ error: "Channel is paused." }, { status: 409, headers: messagingHeaders });
  const { content, mediaUrl, template } = parsed.data;
  const requestId = parsed.data.requestId ?? randomUUID();
  const previous = await prisma.messagingMessage.findUnique({
    where: {
      conversationId_clientRequestId: {
        conversationId: conversation.id,
        clientRequestId: requestId,
      },
    },
  });
  if (previous) return Response.json({ message: previous, duplicate: true }, { headers: messagingHeaders });
  if (template && conversation.channel.platform !== "WHATSAPP")
    return Response.json(
      { error: "Templates are only supported for WhatsApp." },
      { status: 400, headers: messagingHeaders },
    );
  if (conversation.channel.platform === "WHATSAPP" && !template) {
    const inbound = await prisma.messagingMessage.findFirst({
      where: { conversationId: conversation.id, direction: "INBOUND" },
      orderBy: { sentAt: "desc" },
    });
    if (!inbound || Date.now() - inbound.sentAt.getTime() > 86_400_000)
      return Response.json(
        { error: "WhatsApp's reply window is closed. Use an approved template." },
        { status: 409, headers: messagingHeaders },
      );
  }
  let saved: MessagingMessage;
  try {
    saved = await prisma.messagingMessage.create({
      data: {
        conversationId: conversation.id,
        clientRequestId: requestId,
        direction: "OUTBOUND",
        content: template ? `[Template: ${template.name}] ${template.params.join(" · ")}` : content || null,
        mediaUrl,
        mediaType: mediaUrl ? "image" : null,
        status: "PENDING",
        senderId: actor.member.userId,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const message = await prisma.messagingMessage.findUnique({
        where: { conversationId_clientRequestId: { conversationId: conversation.id, clientRequestId: requestId } },
      });
      return Response.json({ message, duplicate: true }, { headers: messagingHeaders });
    }
    throw error;
  }
  let providerAccepted = false;
  try {
    let result: { externalId: string };
    if (conversation.channel.platform === "TELEGRAM")
      result = mediaUrl
        ? await sendTelegramPhoto(conversation.channelId, conversation.externalId, mediaUrl, content)
        : await sendTelegramMessage(conversation.channelId, conversation.externalId, content);
    else if (template)
      result = await sendWhatsAppTemplate(
        conversation.channelId,
        conversation.externalId,
        template.name,
        template.params,
        template.language,
      );
    else
      result = mediaUrl
        ? await sendWhatsAppImage(conversation.channelId, conversation.externalId, mediaUrl, content)
        : await sendWhatsAppMessage(conversation.channelId, conversation.externalId, content);
    providerAccepted = true;
    const message = await prisma.$transaction(async (tx) => {
      // Lock before reading the newest timestamp, also used by inbound/read transactions.
      await tx.messagingConversation.update({
        where: { id: conversation.id },
        data: { unreadCount: { increment: 0 } },
      });
      const updated = await tx.messagingMessage.update({
        where: { id: saved.id },
        data: { externalId: result.externalId, status: "SENT" },
      });
      const current = await tx.messagingConversation.findUniqueOrThrow({ where: { id: conversation.id } });
      await tx.messagingConversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt:
            !current.lastMessageAt || saved.sentAt > current.lastMessageAt ? saved.sentAt : current.lastMessageAt,
        },
      });
      return updated;
    });
    return Response.json({ message }, { status: 201, headers: messagingHeaders });
  } catch {
    if (!providerAccepted)
      await prisma.messagingMessage.updateMany({
        where: { id: saved.id, status: "PENDING" },
        data: { status: "FAILED" },
      });
    return Response.json(
      {
        error: providerAccepted
          ? "Provider accepted the message but saving confirmation failed. Do not resend; check the provider."
          : "Could not confirm delivery. Check the thread and provider before sending again.",
        messageId: saved.id,
      },
      { status: 502, headers: messagingHeaders },
    );
  }
}
