-- Apply once after workspace, ACL and notification migrations. Existing records are preserved.
BEGIN;
CREATE TYPE "MessagingPlatform" AS ENUM ('WHATSAPP', 'TELEGRAM');
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE "MessagingChannel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "platform" "MessagingPlatform" NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelName" TEXT NOT NULL,
  "phoneNumber" TEXT,
  "botUsername" TEXT,
  "accessToken" TEXT,
  "webhookSecret" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MessagingChannel_platform_channelId_key" ON "MessagingChannel"("platform", "channelId");
CREATE INDEX "MessagingChannel_workspaceId_idx" ON "MessagingChannel"("workspaceId");

CREATE TABLE "MessagingConversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "externalId" TEXT NOT NULL,
  "displayName" TEXT,
  "channelId" TEXT NOT NULL REFERENCES "MessagingChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assignedToId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
  "lastMessageAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MessagingConversation_channelId_externalId_key" ON "MessagingConversation"("channelId", "externalId");
CREATE INDEX "MessagingConversation_contactId_idx" ON "MessagingConversation"("contactId");
CREATE INDEX "MessagingConversation_channelId_lastMessageAt_idx" ON "MessagingConversation"("channelId", "lastMessageAt");
CREATE INDEX "MessagingConversation_assignedToId_idx" ON "MessagingConversation"("assignedToId");

CREATE TABLE "MessagingMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "externalId" TEXT,
  "clientRequestId" TEXT,
  "conversationId" TEXT NOT NULL REFERENCES "MessagingConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "direction" "MessageDirection" NOT NULL,
  "content" TEXT,
  "mediaUrl" TEXT,
  "mediaId" TEXT,
  "mediaType" TEXT,
  "status" "MessageDeliveryStatus" NOT NULL DEFAULT 'SENT',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "senderId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MessagingMessage_conversationId_externalId_key" ON "MessagingMessage"("conversationId", "externalId");
CREATE UNIQUE INDEX "MessagingMessage_conversationId_clientRequestId_key" ON "MessagingMessage"("conversationId", "clientRequestId");
CREATE INDEX "MessagingMessage_conversationId_sentAt_idx" ON "MessagingMessage"("conversationId", "sentAt");
COMMIT;
