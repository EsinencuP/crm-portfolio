import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { workflowActor, workflowHeaders, workflowWhere } from "@/lib/workflows/access";
import { validateWorkflowReferences, workflowApiFailure, workflowBody, workflowStepData } from "@/lib/workflows/api";
import { workflowSchema } from "@/lib/workflows/config";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1),
  );
  const where = workflowWhere(actor.member);
  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        trigger: true,
        isActive: true,
        runCount: true,
        lastRunAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.workflow.count({ where }),
  ]);
  return Response.json({ workflows, total, page }, { headers: workflowHeaders });
}
export async function POST(request: Request) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const parsed = workflowSchema.safeParse(await workflowBody(request));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid workflow configuration.", issues: parsed.error.issues },
      { status: 400, headers: workflowHeaders },
    );
  try {
    await validateWorkflowReferences(parsed.data, actor.member.userId, actor.member.workspaceId);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid workspace references." },
      { status: 400, headers: workflowHeaders },
    );
  }
  try {
    const { steps, triggerConfig, canvas, ...input } = parsed.data;
    const workflow = await prisma.$transaction(async (tx) => {
      const created = await tx.workflow.create({
        data: {
          ...input,
          triggerConfig: triggerConfig as Prisma.InputJsonValue,
          canvas: canvas == null ? Prisma.DbNull : (canvas as Prisma.InputJsonValue),
          workspaceId: actor.member.workspaceId,
          createdById: actor.member.userId,
          steps: { create: workflowStepData(steps) },
        },
        include: { steps: { orderBy: { position: "asc" } } },
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Workflow",
          entityId: created.id,
          entityName: created.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return created;
    });
    return Response.json({ workflow }, { status: 201, headers: workflowHeaders });
  } catch (error) {
    return workflowApiFailure(error, workflowHeaders);
  }
}
