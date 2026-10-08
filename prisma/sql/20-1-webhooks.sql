-- Additive migration. Apply once after the CRM/workspace schema.
BEGIN;
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'RETRYING');
CREATE TABLE "Webhook" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "events" TEXT[] NOT NULL,
  "secret" TEXT, "headers" JSONB, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTriggeredAt" TIMESTAMP(3), "failCount" INTEGER NOT NULL DEFAULT 0,
  "workspaceId" TEXT NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Webhook_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Webhook_workspaceId_isActive_idx" ON "Webhook"("workspaceId", "isActive");
CREATE INDEX "Webhook_workspaceId_createdAt_idx" ON "Webhook"("workspaceId", "createdAt");
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL, "webhookId" TEXT NOT NULL, "event" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "payloadText" TEXT NOT NULL, "eventKey" TEXT NOT NULL, "endpointUrl" TEXT NOT NULL,
  "signingSecret" TEXT, "requestHeaders" JSONB, "isTest" BOOLEAN NOT NULL DEFAULT false,
  "responseCode" INTEGER, "responseBody" TEXT, "duration" INTEGER, "error" TEXT,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WebhookDelivery_webhookId_eventKey_key" ON "WebhookDelivery"("webhookId", "eventKey");
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");
CREATE INDEX "WebhookDelivery_status_nextRetryAt_leaseExpiresAt_idx" ON "WebhookDelivery"("status", "nextRetryAt", "leaseExpiresAt");
COMMIT;
