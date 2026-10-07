import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess, getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const idSchema = z.string().trim().min(1).max(128);
const dealSchema = z.object({ dealId: idSchema });
const searchSchema = z.string().trim().max(100);
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view deals." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  const id = idSchema.safeParse((await params).id);
  const search = searchSchema.safeParse(new URL(request.url).searchParams.get("search") ?? "");
  if (!id.success || !search.success) return Response.json({ error: "Invalid request." }, { status: 400, headers });
  if (!(await canAccess(user.id, "Contact", id.data, "VIEW")))
    return Response.json({ error: "Contact not found." }, { status: 404, headers });

  try {
    const deals = await prisma.deal.findMany({
      where: {
        workspaceId: member.workspaceId,
        id: { in: await getAccessibleEntityIds(user.id, "Deal", member.workspaceId) },
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
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
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
  if (
    !(await canAccess(user.id, "Contact", id.data, "EDIT")) ||
    !(await canAccess(user.id, "Deal", parsed.data.dealId, "EDIT"))
  )
    return Response.json({ error: "Access denied." }, { status: 403, headers });

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: id.data, workspaceId: member.workspaceId },
      select: { id: true },
    });
    if (!contact) return Response.json({ error: "Contact not found." }, { status: 404, headers });
    const updated = await prisma.deal.updateMany({
      where: { id: parsed.data.dealId, contactId: null, workspaceId: member.workspaceId },
      data: { contactId: id.data },
    });
    if (updated.count === 0) {
      const deal = await prisma.deal.findUnique({
        where: { id: parsed.data.dealId, workspaceId: member.workspaceId },
        select: { contactId: true },
      });
      if (!deal) return Response.json({ error: "Deal not found." }, { status: 404, headers });
      if (deal.contactId !== id.data)
        return Response.json({ error: "Deal is linked to another contact." }, { status: 409, headers });
    }
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Unable to link deal." }, { status: 500, headers });
  }
}
