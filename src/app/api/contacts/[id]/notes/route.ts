import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const noteSchema = z.object({ content: z.string().trim().min(1, "Note cannot be empty.").max(10000) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to add notes." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Contact", id.data, "EDIT")))
    return Response.json({ error: "Access denied." }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Please send JSON." }, { status: 415, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400, headers });

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: id.data, workspaceId: member.workspaceId },
      select: { id: true },
    });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    const note = await prisma.note.create({
      data: { content: parsed.data.content, contactId: id.data, authorId: user.id, workspaceId: member.workspaceId },
      include: { author: { select: { id: true, name: true } } },
    });
    return Response.json(note, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return Response.json({ error: "Contact not found." }, { status: 404, headers });
    }
    return Response.json({ error: "Unable to add note." }, { status: 500, headers });
  }
}
