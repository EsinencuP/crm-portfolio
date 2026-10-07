-- Additive migration. Apply once after the existing CRM/workspace migrations.
BEGIN;
CREATE TABLE "LeadCaptureForm" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "description" TEXT, "fields" JSONB NOT NULL, "style" JSONB,
  "thankyouMessage" TEXT DEFAULT 'Thank you! We''ll be in touch.', "redirectUrl" TEXT,
  "assignToId" TEXT, "tagIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "pipelineStageId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "submissionCount" INTEGER NOT NULL DEFAULT 0,
  "workspaceId" TEXT NOT NULL, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadCaptureForm_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeadCaptureForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadCaptureForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadCaptureForm_slug_key" ON "LeadCaptureForm"("slug");
CREATE INDEX "LeadCaptureForm_workspaceId_createdAt_idx" ON "LeadCaptureForm"("workspaceId", "createdAt");
CREATE TABLE "FormSubmission" (
  "id" TEXT NOT NULL, "formId" TEXT NOT NULL, "data" JSONB NOT NULL, "contactId" TEXT,
  "clientRequestId" TEXT NOT NULL, "ipAddress" TEXT, "userAgent" TEXT, "referrer" TEXT,
  "processed" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "LeadCaptureForm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FormSubmission_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FormSubmission_formId_clientRequestId_key" ON "FormSubmission"("formId", "clientRequestId");
CREATE INDEX "FormSubmission_formId_createdAt_idx" ON "FormSubmission"("formId", "createdAt");
CREATE INDEX "FormSubmission_formId_ipAddress_createdAt_idx" ON "FormSubmission"("formId", "ipAddress", "createdAt");
COMMIT;
