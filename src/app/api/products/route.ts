import { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { productActor, productFailure, productHeaders, productSelect, readProductBody } from "@/lib/products/api";
import { createProductSchema, productQuerySchema } from "@/lib/validations/product";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await productActor();
  if (actor.error) return actor.error;
  const params = new URL(request.url).searchParams;
  const query = productQuerySchema.safeParse(
    Object.fromEntries(
      ["page", "limit", "search", "category", "isActive", "sortBy", "sortOrder"].map((key) => [
        key,
        params.get(key) ?? undefined,
      ]),
    ),
  );
  if (!query.success)
    return Response.json(
      { error: "Invalid catalog filters.", fieldErrors: z.flattenError(query.error).fieldErrors },
      { status: 400, headers: productHeaders },
    );
  const { page, limit, search, category, isActive, sortBy, sortOrder } = query.data;
  const workspace = { workspaceId: actor.member.workspaceId, deletedAt: null };
  const where: Prisma.ProductWhereInput = {
    ...workspace,
    ...(search
      ? {
          OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }],
        }
      : {}),
    ...(category ? { category: { equals: category, mode: "insensitive" } } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
  try {
    const [products, total, groups] = await prisma.$transaction(
      async (tx) =>
        Promise.all([
          tx.product.findMany({
            where,
            select: productSelect,
            orderBy: [{ [sortBy]: sortOrder }, { id: "asc" }],
            skip: (page - 1) * limit,
            take: limit,
          }),
          tx.product.count({ where }),
          tx.product.findMany({
            where: { ...workspace, category: { not: null } },
            distinct: ["category"],
            select: { category: true },
            orderBy: { category: "asc" },
            take: 200,
          }),
        ]),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return Response.json(
      {
        products,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        categories: groups.map((item) => item.category).filter((value) => value !== null),
      },
      { headers: productHeaders },
    );
  } catch (error) {
    return productFailure(error);
  }
}
export async function POST(request: Request) {
  const actor = await productActor(true);
  if (actor.error) return actor.error;
  const body = await readProductBody(request);
  if (body.error) return body.error;
  const parsed = createProductSchema.safeParse(body.body);
  if (!parsed.success)
    return Response.json(
      { error: "Check product details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers: productHeaders },
    );
  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...parsed.data, workspaceId: actor.member.workspaceId },
        select: productSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Product",
          entityId: created.id,
          entityName: created.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return created;
    });
    return Response.json(product, { status: 201, headers: productHeaders });
  } catch (error) {
    return productFailure(error);
  }
}
