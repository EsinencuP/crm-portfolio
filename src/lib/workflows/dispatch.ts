import "server-only";

import type { Queue } from "bullmq";

import prisma from "@/lib/prisma";

import { triggerConfigSchema } from "./config";
import { triggerWorkflows } from "./engine";

export async function enqueueWorkflowRun(queue: Pick<Queue, "add" | "getJob">, runId: string) {
  const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
  if (!run || !["RUNNING", "WAITING"].includes(run.status) || (run.leaseExpiresAt && run.leaseExpiresAt > new Date()))
    return;
  const jobId = `workflow-${run.id}-${run.currentStep}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const status = await existing.getState();
    if (!["completed", "failed"].includes(status)) return;
    await existing.remove();
  }
  await queue.add(
    "workflow-execute",
    { runId: run.id, step: run.currentStep },
    {
      jobId,
      delay: Math.max(0, (run.resumeAt?.getTime() ?? 0) - Date.now()),
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  );
}
export async function dispatchWorkflowRuns(queue: Pick<Queue, "add" | "getJob">) {
  const now = new Date();
  const runs = await prisma.workflowRun.findMany({
    where: {
      status: { in: ["RUNNING", "WAITING"] },
      AND: [
        { OR: [{ resumeAt: null }, { resumeAt: { lte: now } }] },
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      ],
    },
    select: { id: true },
    orderBy: { startedAt: "asc" },
    take: 100,
  });
  for (const run of runs) await enqueueWorkflowRun(queue, run.id);
}
export async function dispatchScheduledWorkflows() {
  const workflows = await prisma.workflow.findMany({
    where: { trigger: "SCHEDULED", isActive: true, deletedAt: null },
    orderBy: { id: "asc" },
  });
  for (const workflow of workflows) {
    const parsed = triggerConfigSchema.safeParse(workflow.triggerConfig);
    if (!parsed.success) continue;
    const { entityType, entityId, intervalMinutes } = parsed.data;
    if (!entityType || !entityId || !intervalMinutes) continue;
    const interval = intervalMinutes * 60000;
    const bucket = Math.floor((Date.now() - workflow.createdAt.getTime()) / interval);
    if (bucket < 1) continue;
    await triggerWorkflows(
      "SCHEDULED",
      entityType,
      entityId,
      workflow.workspaceId,
      {},
      undefined,
      `schedule-${bucket}`,
      workflow.id,
    );
  }
}
