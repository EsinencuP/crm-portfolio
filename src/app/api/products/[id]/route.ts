import { z } from "zod";

import { computeChanges, createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { productActor, productFailure, productHeaders, productSelect, readProductBody } from "@/lib/products/api";
import { updateProductSchema } from "@/lib/validations/product";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await productActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  try {
    const product = await prisma.product.findFirst({
      where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
      select: productSelect,
    });
    return product
      ? Response.json(product, { headers: productHeaders })
      : Response.json({ error: "Product not found." }, { status: 404, headers: productHeaders });
  } catch (error) {
    return productFailure(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const actor = await productActor(true);
  if (actor.error) return actor.error;
  const { id } = await params;
  const body = await readProductBody(request);
  if (body.error) return body.error;
  const parsed = updateProductSchema.safeParse(body.body);
  if (!parsed.success)
    return Response.json(
      { error: "Check product details and current updatedAt.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400, headers: productHeaders },
    );
  const { updatedAt, ...data } = parsed.data;
  const where = { id, workspaceId: actor.member.workspaceId, deletedAt: null };
  try {
    const product = await prisma.$transaction(async (tx) => {
      const previous = await tx.product.findFirst({ where, select: productSelect });
      if (!previous) return null;
      const updated = await tx.product.update({
        where: { ...where, updatedAt: new Date(updatedAt) },
        data,
        select: productSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Product",
          entityId: id,
          entityName: updated.name,
          changes: computeChanges(previous, updated, Object.keys(data)),
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return updated;
    });
    return product
      ? Response.json(product, { headers: productHeaders })
      : Response.json({ error: "Product not found." }, { status: 404, headers: productHeaders });
  } catch (error) {
    return productFailure(error);
  }
}
export async function DELETE(_request: Request, { params }: Context) {
  const actor = await productActor(true);
  if (actor.error) return actor.error;
  const { id } = await params;
  try {
    const removed = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
        select: productSelect,
      });
      if (!product) return false;
      await tx.product.update({
        where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
        data: { isActive: false, deletedAt: new Date() },
      });
      await createAuditLog(
        {
          action: "DELETE",
          entityType: "Product",
          entityId: id,
          entityName: product.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return true;
    });
    return removed
      ? new Response(null, { status: 204, headers: productHeaders })
      : Response.json({ error: "Product not found." }, { status: 404, headers: productHeaders });
  } catch (error) {
    return productFailure(error);
  }
}
