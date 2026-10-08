import "server-only";

import type { Prisma, WorkflowRun, WorkflowRunStatus } from "@prisma/client";
import { z } from "zod";

import prisma from "@/lib/prisma";

import { creatorMember, entityAccess, type WorkflowDb } from "./access";
import {
  type ActionContext,
  executeCallWebhook,
  executeDatabaseAction,
  executeSendEmail,
  executeWait,
} from "./actions";
import { entities, stepSchema, type WorkflowEntity } from "./config";
import { randomUUID } from "node:crypto";

export const executionPayload = z
  .object({ runId: z.string().min(1).max(128), step: z.number().int().min(0).max(50) })
  .strict();
const effects = { email: executeSendEmail, webhook: executeCallWebhook };
type Effects = typeof effects;
async function lockRun(db: Pick<typeof prisma, "$queryRaw">, id: string) {
  await db.$queryRaw`SELECT "id" FROM "WorkflowRun" WHERE "id" = ${id} FOR UPDATE`;
}
function checkpoint(
  db: WorkflowDb,
  run: WorkflowRun,
  token: string,
  result: Prisma.InputJsonObject,
  action: string,
  options: { resumeAt?: Date; stop?: boolean; nextPosition?: number } = {},
) {
  const stepCount = Array.isArray(run.stepsSnapshot) ? run.stepsSnapshot.length : 0;
  const next = options.nextPosition === -1 ? stepCount : (options.nextPosition ?? run.currentStep + 1);
  let status: WorkflowRunStatus = next >= stepCount ? "COMPLETED" : "RUNNING";
  if (options.resumeAt) status = "WAITING";
  if (options.stop) status = "CANCELLED";
  return db.workflowRun.update({
    where: { id: run.id, leaseToken: token, currentStep: run.currentStep },
    data: {
      currentStep: next,
      status,
      completedAt: ["COMPLETED", "CANCELLED"].includes(status) ? new Date() : null,
      resumeAt: options.resumeAt ?? null,
      leaseToken: null,
      leaseExpiresAt: null,
      externalStartedStep: null,
      logs: { push: { step: run.currentStep, action, result, timestamp: new Date().toISOString() } },
    },
  });
}
export async function processWorkflowJob(payload: unknown, externalEffects: Effects = effects) {
  const input = executionPayload.parse(payload);
  const token = randomUUID();
  const now = new Date();
  const acquired = await prisma.workflowRun.updateMany({
    where: {
      id: input.runId,
      currentStep: input.step,
      status: { in: ["RUNNING", "WAITING"] },
      AND: [
        { OR: [{ resumeAt: null }, { resumeAt: { lte: now } }] },
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      ],
    },
    data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + 120000), status: "RUNNING" },
  });
  if (!acquired.count) return;
  try {
    const plan = await prisma.$transaction(async (tx) => {
      await lockRun(tx, input.runId);
      const run = await tx.workflowRun.findFirst({
        where: { id: input.runId, leaseToken: token },
        include: { workflow: true },
      });
      if (!run) return null;
      if (!run.workflow.isActive || run.workflow.deletedAt) {
        await tx.workflowRun.update({
          where: { id: run.id, leaseToken: token },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
            leaseToken: null,
            leaseExpiresAt: null,
            error: "Workflow paused or deleted.",
          },
        });
        return null;
      }
      if (!entities.some((value) => value === run.entityType)) throw new Error("Invalid workflow entity.");
      const member = await creatorMember(tx, run.workflow.createdById, run.workflow.workspaceId);
      if (!(await entityAccess(tx, member, run.entityType as WorkflowEntity, run.entityId)))
        throw new Error("Workflow creator no longer has record access.");
      const snapshotContext = run.context as Record<string, unknown>;
      if (
        typeof snapshotContext.relatedContactId === "string" &&
        !(await entityAccess(tx, member, "Contact", snapshotContext.relatedContactId, "VIEW"))
      )
        throw new Error("Workflow creator no longer has related contact access.");
      const steps = z.array(stepSchema).max(50).parse(run.stepsSnapshot);
      const step = steps[run.currentStep];
      if (!step) {
        await tx.workflowRun.update({
          where: { id: run.id, leaseToken: token },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            resumeAt: null,
            leaseToken: null,
            leaseExpiresAt: null,
          },
        });
        return null;
      }
      if (run.externalStartedStep === run.currentStep)
        throw new Error("External action outcome is uncertain. Inspect the provider before starting a new run.");
      const context: ActionContext = {
        db: tx,
        member,
        entityType: run.entityType as WorkflowEntity,
        entityId: run.entityId,
        runId: run.id,
        step: run.currentStep,
        data: run.context as Record<string, unknown>,
      };
      if (step.type === "SEND_EMAIL" || step.type === "CALL_WEBHOOK") {
        await tx.workflowRun.update({
          where: { id: run.id, leaseToken: token },
          data: {
            externalStartedStep: run.currentStep,
            logs: {
              push: {
                step: run.currentStep,
                action: step.type,
                result: "external-started",
                timestamp: new Date().toISOString(),
              },
            },
          },
        });
        return { run, step, context: { ...context, db: prisma } };
      }
      if (step.type === "WAIT") {
        await checkpoint(tx, run, token, { duration: step.config.duration }, step.type, {
          resumeAt: executeWait(step.config),
          nextPosition: step.nextPosition,
        });
        return null;
      }
      const result = await executeDatabaseAction(step, context);
      await checkpoint(tx, run, token, result, step.type, {
        stop: step.type === "CONDITION" && result.continue === false && !step.nodeId,
        nextPosition: step.type === "CONDITION" && result.continue === false ? step.elsePosition : step.nextPosition,
      });
      return null;
    });
    if (!plan) return;
    const result =
      plan.step.type === "SEND_EMAIL"
        ? await externalEffects.email(plan.step.config, plan.context)
        : await externalEffects.webhook(plan.step.config, plan.context);
    await prisma.$transaction(async (tx) => {
      await lockRun(tx, input.runId);
      const current = await tx.workflowRun.findFirst({
        where: { id: input.runId, leaseToken: token, currentStep: input.step },
      });
      if (current)
        await checkpoint(tx, current, token, result, plan.step.type, { nextPosition: plan.step.nextPosition });
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Invalid workflow action configuration."
        : error instanceof Error
          ? error.message.slice(0, 500)
          : "Workflow action failed.";
    const current = await prisma.workflowRun.findFirst({ where: { id: input.runId, leaseToken: token } });
    await prisma.workflowRun.updateMany({
      where: { id: input.runId, leaseToken: token },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        error:
          current?.externalStartedStep != null
            ? "External action failed or its outcome is uncertain. Inspect the provider before retrying."
            : message,
        logs: { push: { step: input.step, action: "FAILED", timestamp: new Date().toISOString() } },
      },
    });
    console.error("Workflow step failed", input.runId, input.step);
  }
}
