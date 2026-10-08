import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { generateQuotationNumber } from "@/lib/document-numbers";
import prisma from "@/lib/prisma";
import {
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  quotationSelect,
  readDocumentBody,
  validateQuotationReferences,
} from "@/lib/quotations/access";
import { calculateQuotation } from "@/lib/quotations/totals";
import { createQuotationSchema, quotationQuerySchema } from "@/lib/validations/quotation";

import { createHash } from "node:crypto";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const params = new URL(request.url).searchParams;
    const parsed = quotationQuerySchema.safeParse(
      Object.fromEntries(["page", "limit", "search", "status"].map((key) => [key, params.get(key) ?? undefined])),
    );
    if (!parsed.success) throw new DocumentError("Invalid quotation filters.");
    const { page, limit, search, status } = parsed.data;
    const scope = await documentScope(actor.member);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const conditions: Prisma.QuotationWhereInput[] = [...scope.AND];
    if (search)
      conditions.push({
        OR: [
          { number: { contains: search, mode: "insensitive" } },
          { clientName: { contains: search, mode: "insensitive" } },
        ],
      });
    if (status === "EXPIRED")
      conditions.push({
        OR: [{ status: "EXPIRED" }, { status: { in: ["DRAFT", "SENT", "VIEWED"] }, expiryDate: { lt: today } }],
      });
    else if (status) {
      conditions.push({ status });
      if (["DRAFT", "SENT", "VIEWED"].includes(status))
        conditions.push({ OR: [{ expiryDate: null }, { expiryDate: { gte: today } }] });
    }
    const where: Prisma.QuotationWhereInput = { ...scope, deletedAt: null, AND: conditions };
    const [quotations, total] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.quotation.findMany({
          where,
          select: {
            id: true,
            number: true,
            clientName: true,
            currency: true,
            grandTotal: true,
            status: true,
            expiryDate: true,
            issueDate: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        tx.quotation.count({ where }),
      ]),
    );
    return Response.json(
      { quotations, total, page, totalPages: Math.ceil(total / limit) },
      { headers: documentHeaders },
    );
  } catch (error) {
    return documentError(error);
  }
}
export async function POST(request: Request) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const parsed = createQuotationSchema.safeParse(await readDocumentBody(request));
    if (!parsed.success)
      return Response.json(
        { error: "Check quotation details.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
        { status: 400, headers: documentHeaders },
      );
    const input = parsed.data;
    const requestDigest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const where = { ...(await documentScope(actor.member, true)), deletedAt: null, requestId: input.requestId };
    const previous = await prisma.quotation.findFirst({ where, select: { ...quotationSelect, requestDigest: true } });
    if (previous) {
      if (previous.requestDigest !== requestDigest)
        throw new DocumentError("Request ID was already used for different content.", 409);
      const { requestDigest: _, ...saved } = previous;
      return Response.json({ ...saved, canWrite: true }, { headers: documentHeaders });
    }
    let amounts: ReturnType<typeof calculateQuotation>;
    try {
      amounts = calculateQuotation(input.lineItems);
    } catch {
      throw new DocumentError("Amounts exceed the document limit.");
    }
    const { requestId, lineItems: _, issueDate, expiryDate, ...fields } = input;
    const { lineItems, ...totals } = amounts;
    const created = await prisma.$transaction(async (tx) => {
      const client = await validateQuotationReferences(input, actor.member, tx);
      const number = await generateQuotationNumber(actor.member.workspaceId, tx, new Date(`${issueDate}T00:00:00Z`));
      const document = await tx.quotation.create({
        data: {
          ...fields,
          ...client,
          ...totals,
          number,
          requestId,
          requestDigest,
          issuerName: actor.member.workspace.name,
          workspaceId: actor.member.workspaceId,
          ownerId: actor.member.userId,
          issueDate: new Date(`${issueDate}T00:00:00Z`),
          expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : null,
          lineItems: { create: lineItems },
        },
        select: quotationSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Quotation",
          entityId: document.id,
          entityName: document.number,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return document;
    });
    return Response.json({ ...created, canWrite: true }, { status: 201, headers: documentHeaders });
  } catch (error) {
    return documentError(error);
  }
}
