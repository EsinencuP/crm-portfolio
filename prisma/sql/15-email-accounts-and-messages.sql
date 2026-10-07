-- Apply after 13-1, 13-2, 13-3 and 14-1 SQL migrations.
-- Back up the database before applying. Tokens are encrypted by the application.
BEGIN;

CREATE TYPE "EmailProvider" AS ENUM ('GMAIL', 'OUTLOOK', 'SMTP');
CREATE TYPE "EmailDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "EmailStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

CREATE TABLE "EmailAccount" (
  "id" TEXT NOT NULL,
  "provider" "EmailProvider" NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt" TIMESTAMP(3),
  "syncCursor" TEXT,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailAccount_email_workspaceId_key" ON "EmailAccount"("email", "workspaceId");
CREATE INDEX "EmailAccount_userId_workspaceId_idx" ON "EmailAccount"("userId", "workspaceId");
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailMessage" (
  "id" TEXT NOT NULL,
  "externalId" TEXT,
  "threadId" TEXT,
  "direction" "EmailDirection" NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT[] NOT NULL,
  "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "bcc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "subject" TEXT NOT NULL,
  "bodyHtml" TEXT,
  "bodyText" TEXT,
  "snippet" TEXT,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "status" "EmailStatus" NOT NULL DEFAULT 'DRAFT',
  "trackingId" TEXT,
  "openedAt" TIMESTAMP(3),
  "openCount" INTEGER NOT NULL DEFAULT 0,
  "clickedAt" TIMESTAMP(3),
  "clickCount" INTEGER NOT NULL DEFAULT 0,
  "accountId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "contactId" TEXT,
  "dealId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmailMessage_trackingId_key" ON "EmailMessage"("trackingId");
CREATE UNIQUE INDEX "EmailMessage_accountId_externalId_key" ON "EmailMessage"("accountId", "externalId");
CREATE INDEX "EmailMessage_threadId_idx" ON "EmailMessage"("threadId");
CREATE INDEX "EmailMessage_contactId_idx" ON "EmailMessage"("contactId");
CREATE INDEX "EmailMessage_accountId_idx" ON "EmailMessage"("accountId");
CREATE INDEX "EmailMessage_workspaceId_receivedAt_idx" ON "EmailMessage"("workspaceId", "receivedAt");
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
