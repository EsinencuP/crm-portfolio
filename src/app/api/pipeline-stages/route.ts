import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const stageSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  probability: z.number().int().min(0).max(100),
});
const reorderSchema = z.object({ stages: z.array(stageSchema.extend({ id: z.string().min(1) })).max(50) });

function canManage(role: string) {
  return role === "ADMIN" || role === "MANAGER";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view pipeline stages." }, { status: 401, headers });
  try {
    const stages = await prisma.pipelineStage.findMany({
      orderBy: [{ position: "asc" }, { id: "asc" }],
      include: { _count: { select: { deals: true } } },
    });
    return Response.json({ stages }, { headers });
  } catch {
    return Response.json({ error: "Unable to load pipeline stages." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (!canManage(user.role)) return Response.json({ error: "Manager access required." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = stageSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid stage details." }, { status: 400, headers });
  const existing = await prisma.pipelineStage.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return Response.json({ error: "A stage with this name already exists." }, { status: 409, headers });
  const last = await prisma.pipelineStage.aggregate({ _max: { position: true } });
  const stage = await prisma.pipelineStage.create({
    data: { ...parsed.data, position: (last._max.position ?? -1) + 1 },
  });
  return Response.json({ stage }, { status: 201, headers });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (!canManage(user.role)) return Response.json({ error: "Manager access required." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid pipeline stages." }, { status: 400, headers });
  const stages = parsed.data.stages;
  const ids = stages.map((stage) => stage.id);
  const names = stages.map((stage) => stage.name.toLocaleLowerCase());
  if (new Set(ids).size !== ids.length || new Set(names).size !== names.length)
    return Response.json({ error: "Stage IDs and names must be unique." }, { status: 400, headers });
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const current = await tx.pipelineStage.findMany({ select: { id: true } });
      if (current.length !== stages.length || current.some((stage) => !ids.includes(stage.id))) return null;
      for (const [position, stage] of stages.entries()) {
        await tx.pipelineStage.update({
          where: { id: stage.id },
          data: { name: stage.name, color: stage.color, probability: stage.probability, position },
        });
      }
      return tx.pipelineStage.findMany({
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: { _count: { select: { deals: true } } },
      });
    });
    if (!saved) return Response.json({ error: "Pipeline changed. Reload and try again." }, { status: 409, headers });
    return Response.json({ stages: saved }, { headers });
  } catch {
    return Response.json({ error: "Unable to save pipeline stages." }, { status: 500, headers });
  }
}
