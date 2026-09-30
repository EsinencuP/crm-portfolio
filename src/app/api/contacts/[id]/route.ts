import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { updateContactSchema } from "@/lib/validations/contact";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ownerSelect = { id: true, name: true, email: true, avatarUrl: true, role: true } as const;
const contactInclude = {
  company: true,
  owner: { select: ownerSelect },
  tags: true,
  deals: true,
  activities: true,
  notes: true,
} satisfies Prisma.ContactInclude;
const idSchema = z.string().trim().min(1).max(128);
type ContactContext = { params: Promise<{ id: string }> };

function writeError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return Response.json({ error: "Contact not found." }, { status: 404, headers });
    if (error.code === "P2002")
      return Response.json({ error: "A contact with this email already exists." }, { status: 409, headers });
    if (error.code === "P2003")
      return Response.json({ error: "Company or owner does not exist." }, { status: 400, headers });
  }

  console.error(
    "Contact update failed.",
    error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "Unexpected error",
  );
  return Response.json({ error: "Unable to update contact. Please try again." }, { status: 500, headers });
}

export async function GET(_request: Request, { params }: ContactContext) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view contacts." }, { status: 401, headers });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });

  try {
    const contact = await prisma.contact.findUnique({ where: { id: id.data }, include: contactInclude });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    return Response.json(contact, { headers });
  } catch {
    return Response.json({ error: "Unable to load contact. Please try again." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request, { params }: ContactContext) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to update contacts." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Please send contact changes as JSON." }, { status: 415, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }

  const parsed = updateContactSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json(
      {
        error: "Please provide valid contact changes.",
        ...(!parsed.success && { fieldErrors: z.flattenError(parsed.error).fieldErrors }),
      },
      { status: 400, headers },
    );
  }

  try {
    const contact = await prisma.contact.update({ where: { id: id.data }, data: parsed.data, include: contactInclude });
    return Response.json(contact, { headers });
  } catch (error) {
    return writeError(error);
  }
}

export async function DELETE(_request: Request, { params }: ContactContext) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to archive contacts." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });

  try {
    const contact = await prisma.contact.update({
      where: { id: id.data },
      data: { status: "ARCHIVED" },
      include: contactInclude,
    });
    return Response.json(contact, { headers });
  } catch (error) {
    return writeError(error);
  }
}
