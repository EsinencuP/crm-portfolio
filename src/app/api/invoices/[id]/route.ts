import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { assertInvoiceDraft, invoiceSelect } from "@/lib/invoices/access";
import prisma from "@/lib/prisma";
import {
  assertVersion,
  canWriteDocument,
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  readDocumentBody,
  validateQuotationReferences,
} from "@/lib/quotations/access";
import { calculateQuotation } from "@/lib/quotations/totals";
import { cancelInvoiceSchema, editInvoiceSchema } from "@/lib/validations/invoice";
import { versionSchema } from "@/lib/validations/quotation";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await documentActor();
  if (actor.error) return actor.error;
  try {
    const { id } = await params;
    const row = await prisma.invoice.findFirst({
      where: { ...(await documentScope(actor.member)), id, deletedAt: null },
      select: { ...invoiceSelect, ownerId: true },
    });
    if (!row) throw new DocumentError("Invoice not found.", 404);
    const { ownerId, ...invoice } = row;
    return Response.json(
      { ...invoice, canWrite: canWriteDocument(actor.member, ownerId) },
      { headers: documentHeaders },
    );
  } catch (error) {
    return documentError(error);
  }
}
export async function PATCH(request: Request, { params }: Context) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const { id } = await params,
      body = await readDocumentBody(request),
      cancel = cancelInvoiceSchema.safeParse(body),
      edit = editInvoiceSchema.safeParse(body);
    if (!cancel.success && !edit.success)
      throw new DocumentError(
        "Check invoice details and current updatedAt. Payment totals/status cannot be set manually.",
      );
    const scope = { ...(await documentScope(actor.member, true)), id, deletedAt: null };
    const document = await prisma.$transaction(async (tx) => {
      const previous = await tx.invoice.findFirst({ where: scope, select: invoiceSelect });
      if (!previous) throw new DocumentError("Invoice not found.", 404);
      const edited = edit.success ? edit.data : null,
        updatedAt = cancel.success ? cancel.data.updatedAt : edited?.updatedAt;
      if (!updatedAt) throw new DocumentError("Current updatedAt is required.");
      assertVersion(previous, updatedAt);
      let data: Prisma.InvoiceUncheckedUpdateInput;
      if (cancel.success) {
        if (
          !previous.amountPaid.isZero() ||
          ["PAID", "CANCELLED", "REFUNDED"].includes(previous.status) ||
          ["SENDING", "UNCERTAIN"].includes(previous.sendState)
        )
          throw new DocumentError("Only an unpaid invoice with known delivery state can be cancelled.", 409);
        data = { status: "CANCELLED" };
      } else {
        if (!edited) throw new DocumentError("Invalid invoice fields.");
        assertInvoiceDraft(previous);
        const paymentCount = await tx.payment.count({
          where: { invoiceId: id, workspaceId: actor.member.workspaceId },
        });
        if (paymentCount) throw new DocumentError("Invoices with a payment history are immutable.", 409);
        const client = await validateQuotationReferences(
          edited,
          actor.member,
          tx,
          previous.currency === edited.currency
            ? previous.lineItems.flatMap((line) => (line.productId ? [line.productId] : []))
            : [],
        );
        let amounts: ReturnType<typeof calculateQuotation>;
        try {
          amounts = calculateQuotation(edited.lineItems);
        } catch {
          throw new DocumentError("Amounts exceed the document limit.");
        }
        const { lineItems, ...totals } = amounts,
          { updatedAt: _, lineItems: __, issueDate, dueDate, ...fields } = edited;
        data = {
          ...fields,
          ...client,
          ...totals,
          issueDate: new Date(`${issueDate}T00:00:00Z`),
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00Z`) : null,
          lineItems: { deleteMany: {}, create: lineItems },
        };
      }
      const saved = await tx.invoice.update({
        where: {
          ...scope,
          updatedAt: new Date(updatedAt),
          status: previous.status,
          sendState: previous.sendState,
          amountPaid: previous.amountPaid,
        },
        data,
        select: invoiceSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Invoice",
          entityId: id,
          entityName: previous.number,
          changes: {
            status: { old: previous.status, new: saved.status },
            grandTotal: { old: previous.grandTotal, new: saved.grandTotal },
          },
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return saved;
    });
    return Response.json({ ...document, canWrite: true }, { headers: documentHeaders });
  } catch (error) {
    return documentError(error);
  }
}
export async function DELETE(request: Request, { params }: Context) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = versionSchema.parse(await readDocumentBody(request)),
      { id } = await params,
      where = { ...(await documentScope(actor.member, true)), id, deletedAt: null };
    await prisma.$transaction(async (tx) => {
      const previous = await tx.invoice.findFirst({ where, select: invoiceSelect });
      if (!previous) throw new DocumentError("Invoice not found.", 404);
      assertVersion(previous, input.updatedAt);
      assertInvoiceDraft(previous);
      if (await tx.payment.count({ where: { invoiceId: id, workspaceId: actor.member.workspaceId } }))
        throw new DocumentError("Invoices with payments cannot be deleted.", 409);
      await tx.invoice.update({
        where: { ...where, updatedAt: new Date(input.updatedAt), status: "DRAFT", sendState: "IDLE", amountPaid: 0 },
        data: { deletedAt: new Date() },
      });
      await createAuditLog(
        {
          action: "DELETE",
          entityType: "Invoice",
          entityId: id,
          entityName: previous.number,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
    });
    return new Response(null, { status: 204, headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Current updatedAt is required." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
