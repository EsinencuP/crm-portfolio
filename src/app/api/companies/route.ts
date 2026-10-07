import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createCompanySchema } from "@/lib/validations/company";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  industry: z.string().trim().max(120).optional(),
  size: z.string().trim().max(80).optional(),
  sortBy: z.enum(["name", "domain", "industry", "size", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view companies." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse(
    Object.fromEntries(
      ["page", "limit", "search", "industry", "size", "sortBy", "sortOrder"].map((key) => [
        key,
        params.get(key) ?? undefined,
      ]),
    ),
  );
  if (!query.success)
    return Response.json(
      { error: "Invalid company filters.", fieldErrors: z.flattenError(query.error).fieldErrors },
      { status: 400, headers },
    );
  const { page, limit, search, industry, size, sortBy, sortOrder } = query.data;
  const [contactIds, dealIds] = await Promise.all([
    getAccessibleEntityIds(user.id, "Contact", member.workspaceId),
    getAccessibleEntityIds(user.id, "Deal", member.workspaceId),
  ]);
  const where: Prisma.CompanyWhereInput = {
    workspaceId: member.workspaceId,
    id: { in: await getAccessibleEntityIds(user.id, "Company", member.workspaceId) },
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { domain: { contains: search, mode: "insensitive" } },
        { industry: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(industry && { industry: { contains: industry, mode: "insensitive" } }),
    ...(size && { size: { contains: size, mode: "insensitive" } }),
  };
  try {
    const [companies, total] = await prisma.$transaction(
      [
        prisma.company.findMany({
          where,
          include: {
            _count: {
              select: { contacts: { where: { id: { in: contactIds } } }, deals: { where: { id: { in: dealIds } } } },
            },
          },
          orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.company.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const totals = companies.length
      ? await prisma.deal.groupBy({
          by: ["companyId", "currency"],
          where: {
            workspaceId: member.workspaceId,
            id: { in: dealIds },
            companyId: { in: companies.map((company) => company.id) },
          },
          _sum: { value: true },
        })
      : [];
    const rows = companies.map((company) => ({
      ...company,
      dealsByCurrency: Object.fromEntries(
        totals
          .filter((total) => total.companyId === company.id)
          .map((total) => [total.currency, total._sum.value?.toString() ?? "0"]),
      ),
    }));
    return Response.json({ companies: rows, total, page, totalPages: Math.ceil(total / limit) }, { headers });
  } catch {
    return Response.json({ error: "Unable to load companies. Please try again." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to create companies." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  if (member.role === "VIEWER") return Response.json({ error: "Viewer role is read-only." }, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return Response.json({ error: "Please send JSON." }, { status: 415, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400, headers });
  }
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Please check the company details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  try {
    const company = await prisma.$transaction(async (tx) => {
      const created = await tx.company.create({ data: { ...parsed.data, workspaceId: member.workspaceId } });
      await tx.recordPermission.create({
        data: {
          entityType: "Company",
          entityId: created.id,
          userId: user.id,
          grantedById: user.id,
          workspaceId: member.workspaceId,
          permission: "FULL",
        },
      });
      return created;
    });
    return Response.json(company, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "A company with this domain already exists." }, { status: 409, headers });
    return Response.json({ error: "Unable to create company." }, { status: 500, headers });
  }
}
