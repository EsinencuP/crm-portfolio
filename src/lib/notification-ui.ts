export const notificationTypes = [
  "DEAL_WON",
  "DEAL_LOST",
  "DEAL_STAGE_CHANGED",
  "TASK_ASSIGNED",
  "TASK_DUE",
  "MENTION",
  "EMAIL_RECEIVED",
  "EMAIL_OPENED",
  "EMAIL_CLICKED",
  "FORM_SUBMISSION",
  "WORKFLOW_COMPLETED",
  "IMPORT_COMPLETED",
  "SEQUENCE_REPLY",
  "SYSTEM",
] as const;

export type NotificationKind = (typeof notificationTypes)[number];
export type NotificationRow = {
  id: string;
  type: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export const notificationIcons: Record<NotificationKind, string> = {
  DEAL_WON: "🏆",
  DEAL_LOST: "📉",
  DEAL_STAGE_CHANGED: "🔄",
  TASK_ASSIGNED: "✅",
  TASK_DUE: "⏰",
  MENTION: "💬",
  EMAIL_RECEIVED: "📧",
  EMAIL_OPENED: "👁️",
  EMAIL_CLICKED: "🔗",
  FORM_SUBMISSION: "📋",
  WORKFLOW_COMPLETED: "⚡",
  IMPORT_COMPLETED: "📥",
  SEQUENCE_REPLY: "↩️",
  SYSTEM: "🔔",
};

export function notificationHref(link: string | null) {
  return link?.startsWith("/dashboard/") && !link.startsWith("//") ? link : "/dashboard/notifications";
}
