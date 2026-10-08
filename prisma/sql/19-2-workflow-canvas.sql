-- Additive migration; apply after 19-1-workflows.sql, before deploying the builder/worker.
BEGIN;
ALTER TABLE "Workflow" ADD COLUMN "canvas" JSONB;
ALTER TABLE "WorkflowStep" ADD COLUMN "nodeId" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "nextPosition" INTEGER;
ALTER TABLE "WorkflowStep" ADD COLUMN "elsePosition" INTEGER;
COMMIT;
