import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess, getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createContactSchema } from "@/lib/validations/contact";
import { belongsToWorkspace, getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ownerSelect = { id: true, name: true, email: true, avatarUrl: true, role: true } as const;
const contactInclude = {
  company: true,
  owner: { select: ownerSelect },
  tags: true,
  _count: { select: { deals: true, activities: true } },
} satisfies Prisma.ContactInclude;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.array(createContactSchema.shape.status.removeDefault()).min(1).max(3).optional(),
  source: z.array(createContactSchema.shape.source.removeDefault()).min(1).max(6).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  companyId: z.string().trim().min(1).max(128).optional(),
  sortBy: z
    .enum(["name", "email", "company", "jobTitle", "phone", "source", "status", "owner", "createdAt"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function listValues(params: URLSearchParams, key: string) {
  const values = params.getAll(key);
  return values.length > 0 ? values.flatMap((value) => value.split(",")) : undefined;
}

function contactWriteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return Response.json({ error: "A contact with this email already exists." }, { status: 409, headers });
    if (error.code === "P2003")
      return Response.json({ error: "Company or owner does not exist." }, { status: 400, headers });
  }

  console.error(
    "Contact creation failed.",
    error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "Unexpected error",
  );
  return Response.json({ error: "Unable to create contact. Please try again." }, { status: 500, headers });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view contacts." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });

  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    search: params.get("search") ?? undefined,
    status: listValues(params, "status"),
    source: listValues(params, "source"),
    ownerId: params.get("ownerId") ?? undefined,
    companyId: params.get("companyId") ?? undefined,
    sortBy: params.get("sortBy") ?? undefined,
    sortOrder: params.get("sortOrder") ?? undefined,
  });
  if (!query.success) {
    return Response.json(
      { error: "Invalid contact filters.", fieldErrors: z.flattenError(query.error).fieldErrors },
      { status: 400, headers },
    );
  }

  const { page, limit, search, status, source, ownerId, companyId, sortBy, sortOrder } = query.data;
  const terms = search?.split(/\s+/).filter(Boolean) ?? [];
  const where: Prisma.ContactWhereInput = {
    workspaceId: member.workspaceId,
    id: { in: await getAccessibleEntityIds(user.id, "Contact", member.workspaceId) },
    status: status ? { in: status } : { not: "ARCHIVED" },
    ...(source && { source: { in: source } }),
    ...(ownerId && { ownerId }),
    ...(companyId && { companyId }),
    ...(terms.length > 0 && {
      AND: terms.map((contains) => ({
        OR: [
          { firstName: { contains, mode: "insensitive" as const } },
          { lastName: { contains, mode: "insensitive" as const } },
          { email: { contains, mode: "insensitive" as const } },
          { phone: { contains, mode: "insensitive" as const } },
          { company: { name: { contains, mode: "insensitive" as const } } },
        ],
      })),
    }),
  };
  const sortColumns: Record<typeof sortBy, Prisma.ContactOrderByWithRelationInput> = {
    name: { firstName: sortOrder },
    email: { email: sortOrder },
    company: { company: { name: sortOrder } },
    jobTitle: { jobTitle: sortOrder },
    phone: { phone: sortOrder },
    source: { source: sortOrder },
    status: { status: sortOrder },
    owner: { owner: { name: sortOrder } },
    createdAt: { createdAt: sortOrder },
  };
  const orderBy: Prisma.ContactOrderByWithRelationInput[] = [sortColumns[sortBy]];
  if (sortBy === "name") orderBy.push({ lastName: sortOrder });
  orderBy.push({ id: "asc" });

  try {
    const [contacts, total, owners] = await prisma.$transaction(
      [
        prisma.contact.findMany({
          where,
          include: contactInclude,
          orderBy,
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.contact.count({ where }),
        prisma.user.findMany({
          where: { workspaceMembers: { some: { workspaceId: member.workspaceId } } },
          select: ownerSelect,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return Response.json({ contacts, total, page, totalPages: Math.ceil(total / limit), owners }, { headers });
  } catch {
    return Response.json({ error: "Unable to load contacts. Please try again." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to create contacts." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });

  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Please send contact details as JSON." }, { status: 415, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }

  const parsed = createContactSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Please check the contact details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  }

  try {
    if (parsed.data.companyId && !(await canAccess(user.id, "Company", parsed.data.companyId, "VIEW")))
      return Response.json({ error: "Related company is not accessible." }, { status: 403, headers });
    if (!(await belongsToWorkspace(member.workspaceId, parsed.data)))
      return Response.json({ error: "Company or owner is outside this workspace." }, { status: 400, headers });
    const contact = await prisma.contact.create({
      data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id, workspaceId: member.workspaceId },
      include: contactInclude,
    });
    return Response.json(contact, { status: 201, headers });
  } catch (error) {
    return contactWriteError(error);
  }
}
