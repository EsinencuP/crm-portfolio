import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const activitySchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.coerce.date(),
});
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to schedule activities." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Contact", id.data, "EDIT")))
    return Response.json({ error: "Access denied." }, { status: 403, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = activitySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Enter a title and valid date." }, { status: 400, headers });
  if (parsed.data.dueDate <= new Date()) {
    return Response.json({ error: "Choose a future date and time." }, { status: 400, headers });
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: id.data, workspaceId: member.workspaceId },
      select: { id: true },
    });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    const activity = await prisma.activity.create({
      data: {
        workspaceId: member.workspaceId,
        type: "MEETING",
        title: parsed.data.title,
        dueDate: parsed.data.dueDate,
        contactId: id.data,
        ownerId: user.id,
      },
    });
    return Response.json(activity, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "Contact not found." }, { status: 404, headers });
    }
    return Response.json({ error: "Unable to schedule meeting." }, { status: 500, headers });
  }
}
