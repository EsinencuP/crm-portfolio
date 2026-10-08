import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { canAccess, getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createDealSchema } from "@/lib/validations/deal";
import { dispatchWebhooks } from "@/lib/webhooks/dispatcher";
import { triggerWorkflows } from "@/lib/workflows/engine";
import { belongsToWorkspace, getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const ownerSelect = { id: true, name: true, email: true, avatarUrl: true } as const;
const dealInclude = {
  stage: true,
  contact: { select: { id: true, firstName: true, lastName: true, email: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  owner: { select: ownerSelect },
} satisfies Prisma.DealInclude;
const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  stageId: z.string().trim().min(1).max(128).optional(),
  contactId: z.string().trim().min(1).max(128).optional(),
  companyId: z.string().trim().min(1).max(128).optional(),
  ownerId: z.string().trim().min(1).max(128).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  sortBy: z.enum(["title", "value", "closeDate", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view deals." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    search: params.get("search") ?? undefined,
    stageId: params.get("stageId") ?? undefined,
    contactId: params.get("contactId") ?? undefined,
    companyId: params.get("companyId") ?? undefined,
    ownerId: params.get("ownerId") ?? undefined,
    priority: params.get("priority") ?? undefined,
    sortBy: params.get("sortBy") ?? undefined,
    sortOrder: params.get("sortOrder") ?? undefined,
  });
  if (!parsed.success)
    return Response.json(
      { error: "Invalid deal filters.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );

  const { page, limit, search, stageId, contactId, companyId, ownerId, priority, sortBy, sortOrder } = parsed.data;
  const where: Prisma.DealWhereInput = {
    workspaceId: member.workspaceId,
    id: { in: await getAccessibleEntityIds(user.id, "Deal", member.workspaceId) },
    ...(search && { title: { contains: search, mode: "insensitive" } }),
    ...(stageId && { stageId }),
    ...(contactId && { contactId }),
    ...(companyId && { companyId }),
    ...(ownerId && { ownerId }),
    ...(priority && { priority }),
  };
  try {
    const [deals, total] = await prisma.$transaction(
      [
        prisma.deal.findMany({
          where,
          include: dealInclude,
          orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.deal.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return Response.json({ deals, total, page, totalPages: Math.ceil(total / limit) }, { headers });
  } catch {
    return Response.json({ error: "Unable to load deals." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to create deals." }, { status: 401, headers });
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
  const parsed = createDealSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      { error: "Please check the deal details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers },
    );
  try {
    if (
      (parsed.data.contactId && !(await canAccess(user.id, "Contact", parsed.data.contactId, "VIEW"))) ||
      (parsed.data.companyId && !(await canAccess(user.id, "Company", parsed.data.companyId, "VIEW")))
    )
      return Response.json({ error: "Related record is not accessible." }, { status: 403, headers });
    if (!(await belongsToWorkspace(member.workspaceId, parsed.data)))
      return Response.json({ error: "Related record is outside this workspace." }, { status: 400, headers });
    const deal = await prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id, workspaceId: member.workspaceId },
        include: dealInclude,
      });
      await triggerWorkflows("DEAL_CREATED", "Deal", created.id, member.workspaceId, {}, tx, created.id);
      await dispatchWebhooks("deal.created", created, member.workspaceId, tx, created.id);
      return created;
    });
    return Response.json(deal, { status: 201, headers });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003")
      return Response.json({ error: "Stage, contact, company or owner does not exist." }, { status: 400, headers });
    return Response.json({ error: "Unable to create deal." }, { status: 500, headers });
  }
}
