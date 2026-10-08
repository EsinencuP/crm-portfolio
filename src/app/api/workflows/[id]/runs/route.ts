import { z } from "zod";

import prisma from "@/lib/prisma";
import { entityAccess, workflowActor, workflowHeaders, workflowWhere } from "@/lib/workflows/access";
import { workflowBody } from "@/lib/workflows/api";
import type { WorkflowEntity } from "@/lib/workflows/config";
import { entities } from "@/lib/workflows/config";
import { triggerWorkflows } from "@/lib/workflows/engine";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { id, ...workflowWhere(actor.member) },
    select: { id: true },
  });
  if (!workflow) return Response.json({ error: "Workflow not found." }, { status: 404, headers: workflowHeaders });
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(new URL(request.url).searchParams.get("page") ?? "1", 10) || 1),
  );
  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where: { workflowId: id },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        status: true,
        currentStep: true,
        logs: true,
        startedAt: true,
        completedAt: true,
        resumeAt: true,
        error: true,
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.workflowRun.count({ where: { workflowId: id } }),
  ]);
  const visibleRuns = await Promise.all(
    runs.map(async (run) => {
      if (
        entities.some((type) => type === run.entityType) &&
        (await entityAccess(prisma, actor.member, run.entityType as WorkflowEntity, run.entityId, "VIEW"))
      )
        return run;
      return { ...run, entityId: null, logs: [], error: "Record no longer accessible." };
    }),
  );
  return Response.json({ runs: visibleRuns, total, page }, { headers: workflowHeaders });
}
const manual = z
  .object({ entityType: z.enum(entities), entityId: z.string().min(1).max(128), requestId: z.uuid() })
  .strict();
export async function POST(request: Request, { params }: Context) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const input = manual.safeParse(await workflowBody(request));
  if (!input.success)
    return Response.json(
      { error: "Provide entityType, entityId and a UUID requestId." },
      { status: 400, headers: workflowHeaders },
    );
  const workflow = await prisma.workflow.findFirst({
    where: { id, ...workflowWhere(actor.member), trigger: "MANUAL", isActive: true },
  });
  if (!workflow)
    return Response.json({ error: "Active manual workflow not found." }, { status: 404, headers: workflowHeaders });
  if (!(await entityAccess(prisma, actor.member, input.data.entityType, input.data.entityId)))
    return Response.json({ error: "Record access denied." }, { status: 403, headers: workflowHeaders });
  try {
    const runIds = await triggerWorkflows(
      "MANUAL",
      input.data.entityType,
      input.data.entityId,
      actor.member.workspaceId,
      {},
      undefined,
      input.data.requestId,
      id,
    );
    return Response.json({ accepted: true, runIds }, { status: 202, headers: workflowHeaders });
  } catch {
    return Response.json({ error: "Unable to start workflow." }, { status: 503, headers: workflowHeaders });
  }
}
