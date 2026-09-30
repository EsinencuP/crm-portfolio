import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { createActivitySchema } from "@/lib/validations/activity";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const include = {
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, title: true } },
  owner: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ActivityInclude;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  start: z.iso.datetime({ offset: true }).optional(),
  end: z.iso.datetime({ offset: true }).optional(),
  completed: z.enum(["true", "false"]).optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse(
    Object.fromEntries(
      ["page", "limit", "start", "end", "completed", "contactId", "dealId", "ownerId"]
        .filter((key) => params.has(key))
        .map((key) => [key, params.get(key)]),
    ),
  );
  if (!query.success) return Response.json({ error: "Invalid activity filters." }, { status: 400, headers });
  const { page, limit, start, end, completed, contactId, dealId, ownerId } = query.data;
  const where: Prisma.ActivityWhereInput = {
    ...(completed !== undefined && { completed: completed === "true" }),
    ...(contactId && { contactId }),
    ...(dealId && { dealId }),
    ...(ownerId && { ownerId }),
    ...((start || end) && { dueDate: { ...(start && { gte: new Date(start) }), ...(end && { lt: new Date(end) }) } }),
  };
  try {
    const [activities, total] = await prisma.$transaction([
      prisma.activity.findMany({
        where,
        include,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activity.count({ where }),
    ]);
    return Response.json({ activities, total, page, totalPages: Math.ceil(total / limit) }, { headers });
  } catch {
    return Response.json({ error: "Unable to load activities." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  if (user.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
  }
  const parsed = createActivitySchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Please check the activity details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  try {
    const activity = await prisma.activity.create({
      data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id },
      include,
    });
    return Response.json(activity, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      return Response.json({ error: "Contact, deal or owner does not exist." }, { status: 400, headers });
    return Response.json({ error: "Unable to create activity." }, { status: 500, headers });
  }
}
