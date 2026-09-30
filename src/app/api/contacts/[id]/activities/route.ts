import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

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
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });

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
    const activity = await prisma.activity.create({
      data: {
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
