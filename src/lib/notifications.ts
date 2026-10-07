import "server-only";

import type { NotificationType, Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  userId: string;
  workspaceId: string;
  metadata?: Prisma.InputJsonValue;
}

export async function createNotification(
  input: CreateNotificationInput,
  db: Pick<typeof prisma, "workspaceMember" | "notification"> = prisma,
) {
  if (input.link && (!input.link.startsWith("/dashboard/") || input.link.startsWith("//"))) {
    throw new Error("Notification links must stay inside the dashboard.");
  }
  const member = await db.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: input.userId, workspaceId: input.workspaceId } },
    select: { id: true },
  });
  if (!member) throw new Error("Notification recipient is not a workspace member.");
  return db.notification.create({ data: input });
}

export async function markAsRead(notificationId: string, userId: string, workspaceId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId, workspaceId, read: false },
    data: { read: true, readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string, workspaceId: string) {
  return prisma.notification.updateMany({
    where: { userId, workspaceId, read: false },
    data: { read: true, readAt: new Date() },
  });
}

export async function getUnreadCount(userId: string, workspaceId: string) {
  return prisma.notification.count({ where: { userId, workspaceId, read: false } });
}

export async function notifyDealStageChange(input: {
  dealId: string;
  dealTitle: string;
  previousStageId: string;
  stage: { id: string; name: string };
  recipientId: string;
  workspaceId: string;
}) {
  if (input.previousStageId === input.stage.id) return null;
  const stageName = input.stage.name.trim().toLowerCase();
  let type: NotificationType = "DEAL_STAGE_CHANGED";
  let title = "Deal stage changed";
  if (stageName === "closed won") {
    type = "DEAL_WON";
    title = "Deal won";
  } else if (stageName === "closed lost") {
    type = "DEAL_LOST";
    title = "Deal lost";
  }
  return createNotification({
    type,
    title,
    body: `${input.dealTitle} moved to ${input.stage.name}.`,
    link: `/dashboard/deals/${encodeURIComponent(input.dealId)}`,
    userId: input.recipientId,
    workspaceId: input.workspaceId,
    metadata: { entityType: "Deal", entityId: input.dealId, stageId: input.stage.id },
  });
}
