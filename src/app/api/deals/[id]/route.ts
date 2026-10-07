import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { notifyDealStageChange } from "@/lib/notifications";
import { canAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateDealSchema } from "@/lib/validations/deal";
import { belongsToWorkspace, getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const ownerSelect = { id: true, name: true, email: true, avatarUrl: true } as const;
const dealInclude = {
  stage: true,
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  owner: { select: ownerSelect },
  tags: true,
  activities: { orderBy: { createdAt: "desc" } },
  notes: { include: { author: { select: ownerSelect } }, orderBy: { createdAt: "desc" } },
} satisfies Prisma.DealInclude;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view deals." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid deal ID." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Deal", id.data, "VIEW")))
    return Response.json({ error: "Deal not found." }, { status: 404, headers });
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: id.data, workspaceId: member.workspaceId },
      include: dealInclude,
    });
    if (!deal) return Response.json({ error: "Deal not found." }, { status: 404, headers });
    return Response.json(deal, { headers });
  } catch {
    return Response.json({ error: "Unable to load deal." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to update deals." }, { status: 401, headers });
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
  const parsed = updateDealSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return Response.json(
      {
        error: "Please provide valid deal changes.",
        ...(!parsed.success && { fieldErrors: z.flattenError(parsed.error).fieldErrors }),
      },
      { status: 400, headers },
    );
  try {
    const previous = parsed.data.stageId
      ? await prisma.deal.findUnique({
          where: { id: id.data, workspaceId: member.workspaceId },
          select: { stageId: true },
        })
      : null;
    if (parsed.data.ownerId !== undefined && !(await canAccess(user.id, "Deal", id.data, "FULL")))
      return Response.json({ error: "Full access required to change owner." }, { status: 403, headers });
    if (
      (parsed.data.contactId && !(await canAccess(user.id, "Contact", parsed.data.contactId, "VIEW"))) ||
      (parsed.data.companyId && !(await canAccess(user.id, "Company", parsed.data.companyId, "VIEW")))
    )
      return Response.json({ error: "Related record is not accessible." }, { status: 403, headers });
    if (!(await belongsToWorkspace(member.workspaceId, parsed.data)))
      return Response.json({ error: "Related record is outside this workspace." }, { status: 400, headers });
    const deal = await prisma.deal.update({
      where: { id: id.data, workspaceId: member.workspaceId },
      data: parsed.data,
      include: dealInclude,
    });
    if (previous) {
      await notifyDealStageChange({
        dealId: deal.id,
        dealTitle: deal.title,
        previousStageId: previous.stageId,
        stage: deal.stage,
        recipientId: deal.ownerId ?? user.id,
        workspaceId: member.workspaceId,
      }).catch(() => console.error("Unable to create deal stage notification."));
    }
    return Response.json(deal, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return Response.json({ error: "Deal not found." }, { status: 404, headers });
      if (error.code === "P2003")
        return Response.json({ error: "Stage, contact, company or owner does not exist." }, { status: 400, headers });
    }
    return Response.json({ error: "Unable to update deal." }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to delete deals." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid deal ID." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Deal", id.data, "FULL")))
    return Response.json({ error: "Access denied." }, { status: 403, headers });
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const deal = await tx.deal.findUnique({
        where: { id: id.data, workspaceId: member.workspaceId },
        select: { id: true },
      });
      if (!deal) return false;
      await tx.activity.updateMany({
        where: { dealId: id.data, workspaceId: member.workspaceId },
        data: { dealId: null },
      });
      await tx.note.updateMany({ where: { dealId: id.data, workspaceId: member.workspaceId }, data: { dealId: null } });
      await tx.deal.delete({ where: { id: id.data, workspaceId: member.workspaceId } });
      await tx.recordPermission.deleteMany({
        where: { workspaceId: member.workspaceId, entityType: "Deal", entityId: id.data },
      });
      return true;
    });
    return deleted
      ? Response.json({ success: true }, { headers })
      : Response.json({ error: "Deal not found." }, { status: 404, headers });
  } catch {
    return Response.json({ error: "Unable to delete deal." }, { status: 500, headers });
  }
}
