import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { updateCompanySchema } from "@/lib/validations/company";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view companies." }, { status: 401, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid company ID." }, { status: 400, headers });
  try {
    const company = await prisma.company.findUnique({
      where: { id: id.data },
      include: {
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
            status: true,
            avatarUrl: true,
          },
          orderBy: { createdAt: "desc" },
        },
        deals: { include: { stage: true }, orderBy: { createdAt: "desc" } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!company) return Response.json({ error: "Company not found." }, { status: 404, headers });
    return Response.json(company, { headers });
  } catch {
    return Response.json({ error: "Unable to load company." }, { status: 500, headers });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to update companies." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid company ID." }, { status: 400, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Please send JSON." }, { status: 415, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0)
    return Response.json(
      {
        error: "Please provide valid company changes.",
        ...(!parsed.success && { fieldErrors: z.flattenError(parsed.error).fieldErrors }),
      },
      { status: 400, headers },
    );
  try {
    const company = await prisma.company.update({ where: { id: id.data }, data: parsed.data });
    return Response.json(company, { headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return Response.json({ error: "Company not found." }, { status: 404, headers });
      if (error.code === "P2002")
        return Response.json({ error: "A company with this domain already exists." }, { status: 409, headers });
    }
    return Response.json({ error: "Unable to update company." }, { status: 500, headers });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to delete companies." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid company ID." }, { status: 400, headers });
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({ where: { id: id.data }, select: { id: true } });
      if (!company) return false;
      await tx.contact.updateMany({ where: { companyId: id.data }, data: { companyId: null } });
      await tx.deal.updateMany({ where: { companyId: id.data }, data: { companyId: null } });
      await tx.note.updateMany({ where: { companyId: id.data }, data: { companyId: null } });
      await tx.company.delete({ where: { id: id.data } });
      return true;
    });
    return deleted
      ? Response.json({ success: true }, { headers })
      : Response.json({ error: "Company not found." }, { status: 404, headers });
  } catch {
    return Response.json({ error: "Unable to delete company." }, { status: 500, headers });
  }
}
