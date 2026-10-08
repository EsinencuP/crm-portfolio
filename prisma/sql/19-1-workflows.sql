-- Additive migration; apply once after the CRM/workspace schema.
BEGIN;
CREATE TYPE "WorkflowTrigger" AS ENUM ('CONTACT_CREATED', 'CONTACT_UPDATED', 'DEAL_CREATED', 'DEAL_STAGE_CHANGED', 'DEAL_WON', 'DEAL_LOST', 'ACTIVITY_COMPLETED', 'FORM_SUBMITTED', 'EMAIL_RECEIVED', 'EMAIL_OPENED', 'MANUAL', 'SCHEDULED');
CREATE TYPE "WorkflowStepType" AS ENUM ('CONDITION', 'SEND_EMAIL', 'CREATE_TASK', 'UPDATE_FIELD', 'ASSIGN_OWNER', 'ADD_TAG', 'MOVE_STAGE', 'SEND_NOTIFICATION', 'CALL_WEBHOOK', 'WAIT', 'SEND_WHATSAPP', 'ENROLL_SEQUENCE');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'WAITING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TABLE "Workflow" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "trigger" "WorkflowTrigger" NOT NULL, "triggerConfig" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "runCount" INTEGER NOT NULL DEFAULT 0, "lastRunAt" TIMESTAMP(3),
  "workspaceId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Workflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Workflow_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Workflow_workspaceId_trigger_isActive_idx" ON "Workflow"("workspaceId", "trigger", "isActive");
CREATE INDEX "Workflow_workspaceId_createdById_createdAt_idx" ON "Workflow"("workspaceId", "createdById", "createdAt");
CREATE TABLE "WorkflowStep" (
  "id" TEXT NOT NULL, "workflowId" TEXT NOT NULL, "position" INTEGER NOT NULL,
  "type" "WorkflowStepType" NOT NULL, "config" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowStep_workflowId_position_key" ON "WorkflowStep"("workflowId", "position");
CREATE TABLE "WorkflowRun" (
  "id" TEXT NOT NULL, "workflowId" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT NOT NULL,
  "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING', "currentStep" INTEGER NOT NULL DEFAULT 0,
  "logs" JSONB[] NOT NULL DEFAULT ARRAY[]::JSONB[], "context" JSONB NOT NULL, "stepsSnapshot" JSONB NOT NULL, "eventKey" TEXT NOT NULL,
  "resumeAt" TIMESTAMP(3), "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "externalStartedStep" INTEGER,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "error" TEXT,
  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkflowRun_workflowId_eventKey_key" ON "WorkflowRun"("workflowId", "eventKey");
CREATE INDEX "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt");
CREATE INDEX "WorkflowRun_status_resumeAt_leaseExpiresAt_idx" ON "WorkflowRun"("status", "resumeAt", "leaseExpiresAt");
COMMIT;
