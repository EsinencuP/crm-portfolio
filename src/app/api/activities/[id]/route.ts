import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { updateActivitySchema } from "@/lib/validations/activity";

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
  const activity = await prisma.activity.findUnique({ where: { id: (await params).id }, include });
  return activity
    ? Response.json(activity, { headers })
    : Response.json({ error: "Activity not found." }, { status: 404, headers });
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
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
    const data: Prisma.ActivityUncheckedUpdateInput = { ...parsed.data };
    if (parsed.data.completed === true) data.completedAt = new Date();
    if (parsed.data.completed === false) data.completedAt = null;
    const activity = await prisma.activity.update({ where: { id: (await params).id }, data, include });
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
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  try {
    await prisma.activity.delete({ where: { id: (await params).id } });
    return Response.json({ success: true }, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return Response.json({ error: "Activity not found." }, { status: 404, headers });
    return Response.json({ error: "Unable to delete activity." }, { status: 500, headers });
  }
}
