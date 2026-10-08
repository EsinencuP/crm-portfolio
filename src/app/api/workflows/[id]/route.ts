import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { workflowActor, workflowHeaders, workflowWhere } from "@/lib/workflows/access";
import { validateWorkflowReferences, workflowApiFailure, workflowBody, workflowStepData } from "@/lib/workflows/api";
import { workflowSchema } from "@/lib/workflows/config";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { ...workflowWhere(actor.member), id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  return workflow
    ? Response.json({ workflow }, { headers: workflowHeaders })
    : Response.json({ error: "Workflow not found." }, { status: 404, headers: workflowHeaders });
}
const patch = z
  .object({
    name: z.string().optional(),
    description: z.string().nullable().optional(),
    trigger: z.string().optional(),
    triggerConfig: z.unknown().optional(),
    isActive: z.boolean().optional(),
    steps: z.array(z.unknown()).optional(),
    canvas: z.unknown().optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export async function PATCH(request: Request, { params }: Context) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const input = patch.safeParse(await workflowBody(request));
  if (!input.success)
    return Response.json(
      { error: "Invalid workflow patch. Include its current updatedAt." },
      { status: 400, headers: workflowHeaders },
    );
  const previous = await prisma.workflow.findFirst({
    where: { ...workflowWhere(actor.member), id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!previous) return Response.json({ error: "Workflow not found." }, { status: 404, headers: workflowHeaders });
  const { updatedAt, ...changes } = input.data;
  const parsed = workflowSchema.safeParse({
    name: previous.name,
    description: previous.description,
    trigger: previous.trigger,
    triggerConfig: previous.triggerConfig,
    isActive: previous.isActive,
    canvas: previous.canvas ?? null,
    steps: previous.steps.map((step) => ({
      type: step.type,
      config: step.config,
      ...(step.nodeId
        ? {
            nodeId: step.nodeId,
            nextPosition: step.nextPosition ?? -1,
            ...(step.type === "CONDITION" ? { elsePosition: step.elsePosition ?? -1 } : {}),
          }
        : {}),
    })),
    ...changes,
  });
  if (!parsed.success)
    return Response.json(
      { error: "Invalid workflow configuration.", issues: parsed.error.issues },
      { status: 400, headers: workflowHeaders },
    );
  try {
    await validateWorkflowReferences(parsed.data, previous.createdById, actor.member.workspaceId);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid workspace references." },
      { status: 400, headers: workflowHeaders },
    );
  }
  try {
    const { steps, triggerConfig, canvas, ...data } = parsed.data;
    const workflow = await prisma.$transaction(async (tx) => {
      const updated = await tx.workflow.update({
        where: { ...workflowWhere(actor.member), id, updatedAt: new Date(updatedAt) },
        data: {
          ...data,
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
          canvas: canvas == null ? Prisma.DbNull : (canvas as Prisma.InputJsonValue),
          steps: { deleteMany: {}, create: workflowStepData(steps) },
        },
        include: { steps: { orderBy: { position: "asc" } } },
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Workflow",
          entityId: id,
          entityName: updated.name,
          changes: { configuration: { old: previous.updatedAt.toISOString(), new: updated.updatedAt.toISOString() } },
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return updated;
    });
    return Response.json({ workflow }, { headers: workflowHeaders });
  } catch (error) {
    return workflowApiFailure(error, workflowHeaders);
  }
}
export async function DELETE(_request: Request, { params }: Context) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  try {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.workflow.update({
        where: { ...workflowWhere(actor.member), id },
        data: { isActive: false, deletedAt: new Date() },
      });
      await tx.workflowRun.updateMany({
        where: { workflowId: id, status: { in: ["RUNNING", "WAITING"] }, leaseToken: null },
        data: { status: "CANCELLED", completedAt: new Date(), error: "Workflow deleted." },
      });
      await createAuditLog(
        {
          action: "DELETE",
          entityType: "Workflow",
          entityId: id,
          entityName: removed.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
    });
    return new Response(null, { status: 204, headers: workflowHeaders });
  } catch (error) {
    return workflowApiFailure(error, workflowHeaders);
  }
}

// The visual builder uses PUT; PATCH remains available to existing clients.
export const PUT = PATCH;
