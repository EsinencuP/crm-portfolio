import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { notifyDealStageChange } from "@/lib/notifications";
import { canAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { changeDealStageSchema } from "@/lib/validations/deal";
import { belongsToWorkspace, getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to move deals." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid deal ID." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Deal", id.data, "EDIT")))
    return Response.json({ error: "Access denied." }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Please send JSON." }, { status: 415, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = changeDealStageSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Please provide a stageId only.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  try {
    if (!(await belongsToWorkspace(member.workspaceId, { stageId: parsed.data.stageId })))
      return Response.json({ error: "Stage not found." }, { status: 404, headers });
    const previous = await prisma.deal.findUnique({
      where: { id: id.data, workspaceId: member.workspaceId },
      select: { stageId: true, title: true, ownerId: true },
    });
    if (!previous) return Response.json({ error: "Deal not found." }, { status: 404, headers });
    const deal = await prisma.deal.update({
      where: { id: id.data, workspaceId: member.workspaceId },
      data: { stageId: parsed.data.stageId },
      select: { id: true, stageId: true, stage: true, updatedAt: true },
    });
    await notifyDealStageChange({
      dealId: deal.id,
      dealTitle: previous.title,
      previousStageId: previous.stageId,
      stage: deal.stage,
      recipientId: previous.ownerId ?? user.id,
      workspaceId: member.workspaceId,
    }).catch(() => console.error("Unable to create deal stage notification."));
    return Response.json(deal, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return Response.json({ error: "Deal not found." }, { status: 404, headers });
      if (error.code === "P2003") return Response.json({ error: "Stage not found." }, { status: 404, headers });
    }
    return Response.json({ error: "Unable to move deal." }, { status: 500, headers });
  }
}
