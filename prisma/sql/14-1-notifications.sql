CREATE TYPE "NotificationType" AS ENUM (
  'DEAL_WON', 'DEAL_LOST', 'DEAL_STAGE_CHANGED', 'TASK_ASSIGNED', 'TASK_DUE',
  'MENTION', 'EMAIL_RECEIVED', 'EMAIL_OPENED', 'FORM_SUBMISSION',
  'WORKFLOW_COMPLETED', 'IMPORT_COMPLETED', 'SEQUENCE_REPLY', 'SYSTEM'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "link" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");
CREATE INDEX "Notification_userId_workspaceId_read_createdAt_idx" ON "Notification"("userId", "workspaceId", "read", "createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
