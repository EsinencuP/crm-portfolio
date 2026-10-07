import "server-only";

import { type MessagingChannel, Prisma } from "@prisma/client";

import type { IncomingMessage } from "@/lib/messaging/types";
import { createNotification } from "@/lib/notifications";
import prisma from "@/lib/prisma";

type Database = Pick<typeof prisma, "contact" | "$queryRaw">;
async function matchContact(db: Database, workspaceId: string, incoming: IncomingMessage) {
  const digits = incoming.phone?.replace(/\D/g, "");
  if (digits && /^\d{8,15}$/.test(digits)) {
    const contacts = await db.$queryRaw<{ id: string; ownerId: string | null }[]>(Prisma.sql`
      SELECT "id", "ownerId" FROM "Contact"
      WHERE "workspaceId" = ${workspaceId} AND regexp_replace("phone", '[^0-9]', '', 'g') = ${digits}
      LIMIT 2`);
    if (contacts.length === 1) return contacts[0];
  }
  if (incoming.telegramUserId) {
    const contacts = await db.contact.findMany({
      where: {
        workspaceId,
        OR: [
          { customFields: { path: ["telegramUserId"], equals: incoming.telegramUserId } },
          { customFields: { path: ["telegramChatId"], equals: incoming.sender } },
        ],
      },
      select: { id: true, ownerId: true },
      take: 2,
    });
    if (contacts.length === 1) return contacts[0];
  }
  return null;
}

export async function receiveMessage(channel: MessagingChannel, incoming: IncomingMessage) {
  return prisma.$transaction(async (tx) => {
    const contact = await matchContact(tx, channel.workspaceId, incoming);
    const owner = contact?.ownerId
      ? await tx.workspaceMember.findUnique({
          where: { userId_workspaceId: { userId: contact.ownerId, workspaceId: channel.workspaceId } },
          select: { userId: true },
        })
      : null;
    const conversation = await tx.messagingConversation.upsert({
      where: { channelId_externalId: { channelId: channel.id, externalId: incoming.sender } },
      create: {
        channelId: channel.id,
        externalId: incoming.sender,
        displayName: incoming.senderName,
        contactId: contact?.id,
        assignedToId: owner?.userId,
      },
      update: {},
    });
    // Lock the shared conversation row before counting unread messages or marking them read.
    const locked = await tx.messagingConversation.update({
      where: { id: conversation.id },
      data: { unreadCount: { increment: 0 } },
    });
    const inserted = await tx.messagingMessage.createMany({
      skipDuplicates: true,
      data: {
        conversationId: conversation.id,
        externalId: incoming.externalId,
        direction: "INBOUND",
        content: incoming.content,
        mediaId: incoming.mediaId,
        mediaType: incoming.mediaType,
        sentAt: incoming.sentAt,
        status: "DELIVERED",
        deliveredAt: incoming.sentAt,
      },
    });
    if (!inserted.count) return locked;
    const updated = await tx.messagingConversation.update({
      where: { id: conversation.id },
      data: {
        unreadCount: { increment: 1 },
        status: "OPEN",
        lastMessageAt:
          !locked.lastMessageAt || incoming.sentAt > locked.lastMessageAt ? incoming.sentAt : locked.lastMessageAt,
        ...(incoming.senderName && { displayName: incoming.senderName }),
        ...(!locked.contactId && contact && { contactId: contact.id }),
      },
    });
    const linkedContact = updated.contactId
      ? await tx.contact.findFirst({
          where: { id: updated.contactId, workspaceId: channel.workspaceId },
          select: { id: true, ownerId: true },
        })
      : null;
    const candidate = updated.assignedToId ?? linkedContact?.ownerId;
    let recipients = candidate
      ? await tx.workspaceMember.findMany({ where: { workspaceId: channel.workspaceId, userId: candidate } })
      : [];
    if (linkedContact) {
      const allowed = [];
      for (const recipient of recipients) {
        if (["OWNER", "ADMIN", "VIEWER"].includes(recipient.role) || recipient.userId === linkedContact.ownerId) {
          if (recipient.role !== "VIEWER") {
            allowed.push(recipient);
            continue;
          }
        }
        const grant = await tx.recordPermission.findUnique({
          where: {
            workspaceId_entityType_entityId_userId: {
              workspaceId: channel.workspaceId,
              entityType: "Contact",
              entityId: linkedContact.id,
              userId: recipient.userId,
            },
          },
        });
        if (recipient.role === "VIEWER" ? grant?.permission !== "NONE" : grant && grant.permission !== "NONE")
          allowed.push(recipient);
      }
      recipients = allowed;
    }
    if (!recipients.length)
      recipients = await tx.workspaceMember.findMany({
        where: { workspaceId: channel.workspaceId, role: { in: ["OWNER", "ADMIN"] } },
        take: 10,
      });
    for (const recipient of recipients)
      await createNotification(
        {
          type: "SYSTEM",
          title: `New ${channel.platform === "WHATSAPP" ? "WhatsApp" : "Telegram"} message`,
          body: (incoming.content ?? `${incoming.mediaType ?? "Media"} message`).slice(0, 240),
          link: `/dashboard/inbox?conversationId=${encodeURIComponent(conversation.id)}`,
          userId: recipient.userId,
          workspaceId: channel.workspaceId,
          metadata: { conversationId: conversation.id, platform: channel.platform },
        },
        tx,
      );
    return updated;
  });
}
