-- Apply after 21-2-quotations.sql (DocumentSequence). No existing data is modified.
BEGIN;
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT','PENDING_REVIEW','SENT','SIGNED','ACTIVE','EXPIRED','CANCELLED');
CREATE TABLE "Contract" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "number" TEXT NOT NULL,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT', "startDate" TIMESTAMP(3), "endDate" TIMESTAMP(3),
  "value" DECIMAL(12,2), "currency" TEXT NOT NULL DEFAULT 'USD', "content" TEXT,
  "signedByClient" BOOLEAN NOT NULL DEFAULT false, "signedByUs" BOOLEAN NOT NULL DEFAULT false,
  "documentUrl" TEXT, "contactId" TEXT REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "companyId" TEXT REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dealId" TEXT REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL, "requestDigest" TEXT NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contract_value_check" CHECK ("value" IS NULL OR "value" >= 0),
  CONSTRAINT "Contract_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"),
  CONSTRAINT "Contract_signatures_check" CHECK ("status" NOT IN ('SIGNED','ACTIVE','EXPIRED') OR ("signedByClient" AND "signedByUs"))
);
CREATE UNIQUE INDEX "Contract_workspaceId_number_key" ON "Contract"("workspaceId","number");
CREATE UNIQUE INDEX "Contract_workspaceId_requestId_key" ON "Contract"("workspaceId","requestId");
CREATE INDEX "Contract_workspaceId_deletedAt_status_createdAt_idx" ON "Contract"("workspaceId","deletedAt","status","createdAt");
COMMIT;
-- Manual rollback, only if the feature is unused: DROP TABLE "Contract"; DROP TYPE "ContractStatus";
