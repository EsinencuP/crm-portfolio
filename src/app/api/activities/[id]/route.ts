import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { createNotification } from "@/lib/notifications";
import { activityAccessWhere, canAccess, canEditActivity } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { updateActivitySchema } from "@/lib/validations/activity";
import { dispatchWebhooks } from "@/lib/webhooks/dispatcher";
import { triggerWorkflows } from "@/lib/workflows/engine";
import { belongsToWorkspace, getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const include = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ActivityInclude;
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  const activity = await prisma.activity.findFirst({
    where: { ...(await activityAccessWhere(user.id, member.workspaceId)), id: (await params).id },
    include,
  });
  return activity
    ? Response.json(activity, { headers })
    : Response.json({ error: "Activity not found." }, { status: 404, headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  if (!(await canEditActivity(user.id, (await params).id, member.workspaceId)))
    return Response.json({ error: "Access denied." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = updateActivitySchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return Response.json(
      {
        error: "Invalid activity changes.",
        ...(!parsed.success && { fieldErrors: z.flattenError(parsed.error).fieldErrors }),
      },
      { status: 400, headers },
    );
  try {
    const previous = parsed.data.ownerId
      ? await prisma.activity.findUnique({
          where: { id: (await params).id, workspaceId: member.workspaceId },
          select: { ownerId: true },
        })
      : null;
    if (!(await belongsToWorkspace(member.workspaceId, parsed.data)))
      return Response.json({ error: "Related record is outside this workspace." }, { status: 400, headers });
    if (
      (parsed.data.contactId && !(await canAccess(user.id, "Contact", parsed.data.contactId, "EDIT"))) ||
      (parsed.data.dealId && !(await canAccess(user.id, "Deal", parsed.data.dealId, "EDIT")))
    )
      return Response.json({ error: "Access denied." }, { status: 403, headers });
    const data: Prisma.ActivityUncheckedUpdateInput = { ...parsed.data };
    if (parsed.data.completed === true) data.completedAt = new Date();
    if (parsed.data.completed === false) data.completedAt = null;
    const activity = await prisma.$transaction(async (tx) => {
      const activityId = (await params).id;
      await tx.$queryRaw`SELECT "id" FROM "Activity" WHERE "id" = ${activityId} AND "workspaceId" = ${member.workspaceId} FOR UPDATE`;
      const old = await tx.activity.findUniqueOrThrow({
        where: { id: activityId, workspaceId: member.workspaceId },
        select: { completed: true },
      });
      const updated = await tx.activity.update({
        where: { id: (await params).id, workspaceId: member.workspaceId },
        data,
        include,
      });
      if (!old.completed && updated.completed)
        await triggerWorkflows(
          "ACTIVITY_COMPLETED",
          "Activity",
          updated.id,
          member.workspaceId,
          {},
          tx,
          updated.updatedAt.toISOString(),
        );
      if (!old.completed && updated.completed)
        await dispatchWebhooks("activity.completed", updated, member.workspaceId, tx, updated.updatedAt.toISOString());
      return updated;
    });
    if (activity.type === "TASK" && previous && previous.ownerId !== activity.ownerId && activity.ownerId !== user.id) {
      await createNotification({
        type: "TASK_ASSIGNED",
        title: "Task assigned to you",
        body: activity.title,
        link: "/dashboard/activities",
        userId: activity.ownerId,
        workspaceId: member.workspaceId,
        metadata: { entityType: "Activity", entityId: activity.id },
      }).catch(() => console.error("Unable to create task assignment notification."));
    }
    return Response.json(activity, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return Response.json({ error: "Activity not found." }, { status: 404, headers });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      return Response.json({ error: "Contact, deal or owner does not exist." }, { status: 400, headers });
    return Response.json({ error: "Unable to update activity." }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  if (!(await canEditActivity(user.id, (await params).id, member.workspaceId)))
    return Response.json({ error: "Access denied." }, { status: 403, headers });
  try {
    await prisma.activity.delete({ where: { id: (await params).id, workspaceId: member.workspaceId } });
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return Response.json({ error: "Activity not found." }, { status: 404, headers });
    return Response.json({ error: "Unable to delete activity." }, { status: 500, headers });
  }
}
