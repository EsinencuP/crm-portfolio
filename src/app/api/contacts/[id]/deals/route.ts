import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const dealSchema = z.object({ dealId: idSchema });
const searchSchema = z.string().trim().max(100);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view deals." }, { status: 401, headers });
  const id = idSchema.safeParse((await params).id);
  const search = searchSchema.safeParse(new URL(request.url).searchParams.get("search") ?? "");
  if (!id.success || !search.success) return Response.json({ error: "Invalid request." }, { status: 400, headers });

  try {
    const deals = await prisma.deal.findMany({
      where: {
        contactId: null,
        ...(search.data && { title: { contains: search.data, mode: "insensitive" } }),
      },
      select: { id: true, title: true, company: { select: { name: true } } },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: 20,
    });
    return Response.json({ deals }, { headers });
  } catch {
    return Response.json({ error: "Unable to load deals." }, { status: 500, headers });
  }
}

export async function POST(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to link deals." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return Response.json({ error: "Invalid contact ID." }, { status: 400, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = dealSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid deal ID." }, { status: 400, headers });

  try {
    const contact = await prisma.contact.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    const updated = await prisma.deal.updateMany({
      where: { id: parsed.data.dealId, contactId: null },
      data: { contactId: id.data },
    });
    if (updated.count === 0) {
      const deal = await prisma.deal.findUnique({ where: { id: parsed.data.dealId }, select: { contactId: true } });
      if (!deal) return Response.json({ error: "Deal not found." }, { status: 404, headers });
      if (deal.contactId !== id.data)
        return Response.json({ error: "Deal is linked to another contact." }, { status: 409, headers });
    }
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to link deal." }, { status: 500, headers });
  }
}
