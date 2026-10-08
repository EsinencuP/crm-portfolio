import "server-only";

import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

import { creatorMember, entityAccess } from "./access";
import type { WorkflowStepInput, workflowSchema } from "./config";
import { webhookUrl } from "./webhook";

export async function workflowBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > 262144) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
export async function validateWorkflowReferences(
  config: ReturnType<typeof workflowSchema.parse>,
  userId: string,
  workspaceId: string,
) {
  const member = await creatorMember(prisma, userId, workspaceId);
  if (
    config.trigger === "SCHEDULED" &&
    config.triggerConfig.entityType &&
    config.triggerConfig.entityId &&
    !(await entityAccess(prisma, member, config.triggerConfig.entityType, config.triggerConfig.entityId))
  )
    throw new Error("Scheduled entity is not accessible to the creator.");
  for (const step of config.steps) {
    if (
      step.type === "SEND_EMAIL" &&
      !(await prisma.emailAccount.count({ where: { id: step.config.accountId, userId, workspaceId } }))
    )
      throw new Error("Email account must belong to the workflow creator and workspace.");
    if (
      "userId" in step.config &&
      step.config.userId &&
      !(await prisma.workspaceMember.count({
        where: { workspaceId, userId: step.config.userId, role: { not: "VIEWER" } },
      }))
    )
      throw new Error("Target user is not a writable workspace member.");
    if (step.type === "ADD_TAG" && !(await prisma.tag.count({ where: { id: step.config.tagId, workspaceId } })))
      throw new Error("Tag not in this workspace.");
    if (
      step.type === "MOVE_STAGE" &&
      !(await prisma.pipelineStage.count({ where: { id: step.config.stageId, workspaceId } }))
    )
      throw new Error("Stage not in this workspace.");
    if (step.type === "CALL_WEBHOOK") webhookUrl(step.config.url);
  }
}
export function workflowStepData(steps: WorkflowStepInput[]) {
  return steps.map((step, position) => ({
    position,
    type: step.type,
    config: step.config as Prisma.InputJsonValue,
    nodeId: step.nodeId,
    nextPosition: step.nextPosition,
    elsePosition: step.elsePosition,
  }));
}
export function workflowApiFailure(error: unknown, headers: HeadersInit) {
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
  if (code === "P2025")
    return Response.json({ error: "Workflow changed or was deleted. Reload before saving." }, { status: 409, headers });
  console.error("Workflow API operation failed", code ?? "unexpected");
  return Response.json({ error: "Unable to update workflow." }, { status: 500, headers });
}
