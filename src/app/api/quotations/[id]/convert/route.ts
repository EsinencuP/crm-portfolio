import { z } from "zod";

import { createAuditLog } from "@/lib/audit";
import { generateInvoiceNumber } from "@/lib/document-numbers";
import { invoiceSelect } from "@/lib/invoices/access";
import prisma from "@/lib/prisma";
import {
  assertUnexpired,
  assertVersion,
  DocumentError,
  documentActor,
  documentError,
  documentHeaders,
  documentScope,
  quotationSelect,
  readDocumentBody,
} from "@/lib/quotations/access";
import { versionSchema } from "@/lib/validations/quotation";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await documentActor(true);
  if (actor.error) return actor.error;
  try {
    const input = versionSchema.parse(await readDocumentBody(request)),
      { id } = await params;
    const where = { ...(await documentScope(actor.member, true)), id, deletedAt: null };
    const invoice = await prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findFirst({ where, select: { ...quotationSelect, ownerId: true } });
      if (!quote) throw new DocumentError("Quotation not found.", 404);
      if (quote.status === "CONVERTED")
        return tx.invoice.findUniqueOrThrow({
          where: { quotationId: id, deletedAt: null, workspaceId: actor.member.workspaceId },
          select: invoiceSelect,
        });
      assertVersion(quote, input.updatedAt);
      assertUnexpired(quote);
      if (
        !["DRAFT", "SENT", "VIEWED", "ACCEPTED"].includes(quote.status) ||
        ["SENDING", "UNCERTAIN"].includes(quote.sendState)
      )
        throw new DocumentError("This quotation cannot be converted.", 409);
      // Lock the quotation before reserving a number: concurrent conversion loses its version race.
      await tx.quotation.update({
        where: { ...where, updatedAt: new Date(input.updatedAt), status: quote.status, sendState: quote.sendState },
        data: { status: "CONVERTED" },
      });
      const number = await generateInvoiceNumber(actor.member.workspaceId, tx);
      const {
        currency,
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        notes,
        terms,
        clientName,
        clientEmail,
        issuerName,
        contactId,
        companyId,
        dealId,
        ownerId,
      } = quote;
      const created = await tx.invoice.create({
        data: {
          number,
          quotationId: id,
          workspaceId: actor.member.workspaceId,
          ownerId,
          currency,
          subtotal,
          taxTotal,
          discountTotal,
          grandTotal,
          notes,
          terms,
          clientName,
          clientEmail,
          issuerName,
          contactId,
          companyId,
          dealId,
          lineItems: { create: quote.lineItems.map(({ id: _, ...line }) => line) },
        },
        select: invoiceSelect,
      });
      await createAuditLog(
        {
          action: "CREATE",
          entityType: "Invoice",
          entityId: created.id,
          entityName: created.number,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Quotation",
          entityId: id,
          entityName: quote.number,
          changes: { status: { old: quote.status, new: "CONVERTED" } },
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return created;
    });
    return Response.json(invoice, { headers: documentHeaders });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json({ error: "Current updatedAt is required." }, { status: 400, headers: documentHeaders });
    return documentError(error);
  }
}
