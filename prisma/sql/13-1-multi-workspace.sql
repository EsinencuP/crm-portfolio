-- Apply once to an existing CRM Portfolio PostgreSQL database before deploying
-- the multi-workspace application. Take a database backup first.
-- All existing CRM data and invitations are assigned to the legacy workspace.
BEGIN;

CREATE TYPE "WorkspacePlan" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "logoUrl" TEXT,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'USD',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "plan" "WorkspacePlan" NOT NULL DEFAULT 'FREE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key" ON "WorkspaceMember"("userId", "workspaceId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE UNIQUE INDEX "WorkspaceMember_one_default_per_user" ON "WorkspaceMember"("userId") WHERE "isDefault" = true;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Workspace" ("id", "name", "slug", "updatedAt") VALUES ('legacy-workspace-default', 'Original Workspace', 'original-workspace', CURRENT_TIMESTAMP);
INSERT INTO "WorkspaceMember" ("id", "role", "isDefault", "userId", "workspaceId")
SELECT 'legacy-member-' || "id",
  CASE
    WHEN "id" = (SELECT "id" FROM "User" ORDER BY CASE WHEN "role" = 'ADMIN' THEN 0 ELSE 1 END, "createdAt", "id" LIMIT 1) THEN 'OWNER'::"WorkspaceRole"
    ELSE "role"::text::"WorkspaceRole"
  END,
  true, "id", 'legacy-workspace-default'
FROM "User";

ALTER TABLE "Contact" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Company" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Deal" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Activity" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Note" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "PipelineStage" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "TeamInvite" ADD COLUMN "workspaceId" TEXT;

UPDATE "Contact" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "Company" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "Deal" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "Activity" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "Note" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "Tag" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "PipelineStage" SET "workspaceId" = 'legacy-workspace-default';
UPDATE "TeamInvite" SET "workspaceId" = 'legacy-workspace-default';

ALTER TABLE "Contact" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Activity" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Note" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Tag" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "PipelineStage" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "TeamInvite" ALTER COLUMN "workspaceId" SET NOT NULL;

DROP INDEX IF EXISTS "Contact_email_key";
DROP INDEX IF EXISTS "Company_domain_key";
DROP INDEX IF EXISTS "Tag_name_key";
DROP INDEX IF EXISTS "TeamInvite_email_key";
CREATE UNIQUE INDEX "Contact_workspaceId_email_key" ON "Contact"("workspaceId", "email");
CREATE UNIQUE INDEX "Company_workspaceId_domain_key" ON "Company"("workspaceId", "domain");
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");
CREATE UNIQUE INDEX "TeamInvite_workspaceId_email_key" ON "TeamInvite"("workspaceId", "email");

CREATE INDEX "Contact_workspaceId_idx" ON "Contact"("workspaceId");
CREATE INDEX "Company_workspaceId_idx" ON "Company"("workspaceId");
CREATE INDEX "Deal_workspaceId_idx" ON "Deal"("workspaceId");
CREATE INDEX "Activity_workspaceId_idx" ON "Activity"("workspaceId");
CREATE INDEX "Note_workspaceId_idx" ON "Note"("workspaceId");
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");
CREATE INDEX "PipelineStage_workspaceId_idx" ON "PipelineStage"("workspaceId");
CREATE INDEX "TeamInvite_workspaceId_idx" ON "TeamInvite"("workspaceId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamInvite" ADD CONSTRAINT "TeamInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
