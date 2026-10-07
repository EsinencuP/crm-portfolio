export type Platform = "WHATSAPP" | "TELEGRAM";
export type ConversationStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type InboxMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  content: string | null;
  mediaUrl: string | null;
  mediaId: string | null;
  mediaType: string | null;
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  sentAt: string;
  readAt: string | null;
};
export type ChannelSummary = {
  id: string;
  platform: Platform;
  channelId: string;
  channelName: string;
  phoneNumber: string | null;
  botUsername: string | null;
  isActive: boolean;
};
export type Conversation = {
  id: string;
  externalId: string;
  displayName: string | null;
  status: ConversationStatus;
  unreadCount: number;
  lastMessageAt: string | null;
  channel: ChannelSummary;
  contact: { id: string; firstName: string; lastName: string } | null;
  assignedTo: { id: string; name: string } | null;
  assignedToId: string | null;
  lastMessage: InboxMessage | null;
  canWrite: boolean;
};
export type IncomingMessage = {
  channelExternalId: string;
  externalId: string;
  sender: string;
  senderName: string | null;
  phone: string | null;
  telegramUserId?: string;
  content: string | null;
  mediaId: string | null;
  mediaType: string | null;
  sentAt: Date;
};
export function conversationName(conversation: Conversation) {
  if (conversation.contact) return `${conversation.contact.firstName} ${conversation.contact.lastName}`;
  return conversation.displayName ?? conversation.externalId;
}
