import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const tagSchema = z.object({ name: z.string().trim().min(1).max(60) });
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to add tags." }, { status: 401, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400, headers });

  try {
    const contact = await prisma.contact.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    const tag = await prisma.tag.upsert({
      where: { name: parsed.data.name },
      create: { name: parsed.data.name },
      update: {},
    });
    await prisma.contact.update({ where: { id: id.data }, data: { tags: { connect: { id: tag.id } } } });
    return Response.json(tag, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "Contact not found." }, { status: 404, headers });
    }
    return Response.json({ error: "Unable to add tag." }, { status: 500, headers });
  }
}
