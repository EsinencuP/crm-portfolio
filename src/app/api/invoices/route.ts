import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { generateInvoiceNumber } from "@/lib/document-numbers";
import { invoiceSelect } from "@/lib/invoices/access";
import prisma from "@/lib/prisma";
import {
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  readDocumentBody,
  validateQuotationReferences,
} from "@/lib/quotations/access";
import { calculateQuotation } from "@/lib/quotations/totals";
import { createInvoiceSchema, invoiceQuerySchema } from "@/lib/validations/invoice";

import { createHash } from "node:crypto";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const params = new URL(request.url).searchParams,
      input = invoiceQuerySchema.parse(
        Object.fromEntries(["page", "limit", "search", "status"].map((key) => [key, params.get(key) ?? undefined])),
      );
    const scope = await documentScope(actor.member),
      conditions: Prisma.InvoiceWhereInput[] = [...scope.AND];
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (input.search)
      conditions.push({
        OR: [
          { number: { contains: input.search, mode: "insensitive" } },
          { clientName: { contains: input.search, mode: "insensitive" } },
        ],
      });
    if (input.status === "OVERDUE")
      conditions.push({
        OR: [{ status: "OVERDUE" }, { status: { in: ["SENT", "VIEWED", "PARTIALLY_PAID"] }, dueDate: { lt: today } }],
      });
    else if (input.status) {
      conditions.push({ status: input.status });
      if (["SENT", "VIEWED", "PARTIALLY_PAID"].includes(input.status))
        conditions.push({ OR: [{ dueDate: null }, { dueDate: { gte: today } }] });
    }
    const where = { ...scope, deletedAt: null, AND: conditions };
    const [invoices, total] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.invoice.findMany({
          where,
          select: {
            id: true,
            number: true,
            clientName: true,
            currency: true,
            grandTotal: true,
            amountPaid: true,
            status: true,
            dueDate: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        tx.invoice.count({ where }),
      ]),
    );
    return Response.json(
      { invoices, total, page: input.page, totalPages: Math.ceil(total / input.limit) },
      { headers: documentHeaders },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Invalid invoice filters." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
export async function POST(request: Request) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = createInvoiceSchema.parse(await readDocumentBody(request));
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = await prisma.invoice.findFirst({
      where: { ...(await documentScope(actor.member, true)), requestId: input.requestId, deletedAt: null },
      select: { ...invoiceSelect, requestDigest: true },
    });
    if (previous) {
      if (previous.requestDigest !== digest)
        throw new DocumentError("Request ID was already used for other content.", 409);
      const { requestDigest: _, ...saved } = previous;
      return Response.json({ ...saved, canWrite: true }, { headers: documentHeaders });
    }
    let amounts: ReturnType<typeof calculateQuotation>;
    try {
      amounts = calculateQuotation(input.lineItems);
    } catch {
      throw new DocumentError("Amounts exceed the document limit.");
    }
    const { requestId, lineItems: _, dueDate, issueDate, ...fields } = input,
      { lineItems, ...totals } = amounts;
    const document = await prisma.$transaction(async (tx) => {
      const client = await validateQuotationReferences(input, actor.member, tx);
      const number = await generateInvoiceNumber(actor.member.workspaceId, tx, new Date(`${issueDate}T00:00:00Z`));
      const saved = await tx.invoice.create({
        data: {
          ...fields,
          ...client,
          ...totals,
          requestId,
          requestDigest: digest,
          number,
          issuerName: actor.member.workspace.name,
          workspaceId: actor.member.workspaceId,
          ownerId: actor.member.userId,
          issueDate: new Date(`${issueDate}T00:00:00Z`),
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
          lineItems: { create: lineItems },
        },
        select: invoiceSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Invoice",
          entityId: saved.id,
          entityName: saved.number,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return saved;
    });
    return Response.json({ ...document, canWrite: true }, { status: 201, headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Check invoice details.", fieldErrors: z.flattenError(error).fieldErrors },
        { status: 400, headers: documentHeaders },
      );
    return documentError(error);
  }
}
