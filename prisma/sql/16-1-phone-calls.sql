-- Apply once after the workspace, audit and notification migrations.
-- Additive migration; existing CRM records are preserved.
BEGIN;

CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'VOICEMAIL', 'FAILED');

CREATE TABLE "PhoneCall" (
  "id" TEXT NOT NULL,
  "direction" "CallDirection" NOT NULL,
  "status" "CallStatus" NOT NULL,
  "fromNumber" TEXT NOT NULL,
  "toNumber" TEXT NOT NULL,
  "duration" INTEGER,
  "recordingUrl" TEXT,
  "transcript" TEXT,
  "notes" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'twilio',
  "externalId" TEXT,
  "dialExternalId" TEXT,
  "dialStarted" BOOLEAN NOT NULL DEFAULT false,
  "contactId" TEXT,
  "dealId" TEXT,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PhoneCall_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PhoneCall_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PhoneCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PhoneCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PhoneCall_externalId_key" ON "PhoneCall"("externalId");
CREATE UNIQUE INDEX "PhoneCall_dialExternalId_key" ON "PhoneCall"("dialExternalId");
CREATE INDEX "PhoneCall_contactId_idx" ON "PhoneCall"("contactId");
CREATE INDEX "PhoneCall_userId_idx" ON "PhoneCall"("userId");
CREATE INDEX "PhoneCall_workspaceId_createdAt_idx" ON "PhoneCall"("workspaceId", "createdAt");

COMMIT;
