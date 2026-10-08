import "server-only";

import type { Prisma, WorkflowTrigger, WorkspaceMember } from "@prisma/client";

import prisma from "@/lib/prisma";

import { creatorMember, entityAccess, loadEntity, WorkflowAccessError, type WorkflowDb } from "./access";
import {
  conditionFields,
  entities,
  evaluateTriggerConditions,
  stepSchema,
  triggerConfigSchema,
  triggers,
  type WorkflowEntity,
} from "./config";
import { createHash, randomUUID } from "node:crypto";

export async function triggerWorkflows(
  trigger: string,
  entityType: string,
  entityId: string,
  workspaceId: string,
  data: Record<string, unknown> = {},
  db?: WorkflowDb,
  eventKey: string = randomUUID(),
  onlyWorkflowId?: string,
): Promise<string[]> {
  if (!triggers.some((value) => value === trigger) || !entities.some((value) => value === entityType))
    throw new Error("Unsupported workflow event.");
  if (!db)
    return prisma.$transaction((tx) =>
      triggerWorkflows(trigger, entityType, entityId, workspaceId, data, tx, eventKey, onlyWorkflowId),
    );
  const workflows = await db.workflow.findMany({
    where: {
      workspaceId,
      trigger: trigger as WorkflowTrigger,
      isActive: true,
      deletedAt: null,
      ...(onlyWorkflowId ? { id: onlyWorkflowId } : {}),
    },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!workflows.length) return [];
  const entity = await loadEntity(db, entityType as WorkflowEntity, entityId, workspaceId);
  if (!entity) return [];
  const context: Record<string, Prisma.InputJsonValue | null> = { entityId, entityType };
  for (const key of conditionFields) {
    const value = Object.hasOwn(data, key) ? data[key] : (entity as unknown as Record<string, unknown>)[key];
    if (value === null || ["string", "number", "boolean"].includes(typeof value))
      context[key] = value as Prisma.InputJsonValue | null;
    else if (key === "value" && value != null) context[key] = String(value);
  }
  const ids: string[] = [];
  for (const workflow of workflows) {
    const config = triggerConfigSchema.safeParse(workflow.triggerConfig);
    if (!config.success || (config.data.entityType && config.data.entityType !== entityType)) continue;
    let member: WorkspaceMember;
    try {
      member = await creatorMember(db, workflow.createdById, workspaceId);
    } catch (error) {
      if (error instanceof WorkflowAccessError) continue;
      throw error;
    }
    if (!(await entityAccess(db, member, entityType as WorkflowEntity, entityId))) continue;
    const runContext = { ...context };
    if (
      "contactId" in entity &&
      entity.contactId &&
      (await entityAccess(db, member, "Contact", entity.contactId, "VIEW"))
    ) {
      const contact = await db.contact.findFirst({
        where: { id: entity.contactId, workspaceId },
        select: { firstName: true, lastName: true, email: true, phone: true },
      });
      if (contact)
        Object.assign(runContext, {
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          relatedContactId: entity.contactId,
        });
    }
    if (!evaluateTriggerConditions(config.data, runContext)) continue;
    const steps = workflow.steps.map((step) =>
      stepSchema.parse({
        type: step.type,
        config: step.config,
        ...(step.nodeId
          ? {
              nodeId: step.nodeId,
              nextPosition: step.nextPosition ?? -1,
              ...(step.type === "CONDITION" ? { elsePosition: step.elsePosition ?? -1 } : {}),
            }
          : {}),
      }),
    );
    const key = createHash("sha256").update(`${trigger}|${entityType}|${entityId}|${eventKey}`).digest("hex");
    const id = randomUUID();
    const created = await db.workflowRun.createMany({
      data: [
        {
          id,
          workflowId: workflow.id,
          entityType,
          entityId,
          eventKey: key,
          context: runContext as Prisma.InputJsonValue,
          stepsSnapshot: steps as Prisma.InputJsonValue,
          status: "RUNNING",
        },
      ],
      skipDuplicates: true,
    });
    if (!created.count) continue;
    await db.workflow.update({
      where: { id: workflow.id, workspaceId },
      data: { runCount: { increment: 1 }, lastRunAt: new Date(), updatedAt: workflow.updatedAt },
    });
    ids.push(id);
  }
  return ids;
}
