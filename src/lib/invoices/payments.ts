import "server-only";

import type { WorkspaceMember } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { canAccess } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { assertVersion, DocumentError, documentScope } from "@/lib/quotations/access";
import type { PaymentInput } from "@/lib/validations/invoice";
import { dispatchWebhooks } from "@/lib/webhooks/dispatcher";

import { invoiceSelect, paymentSelect } from "./access";
import { applyInvoicePayment } from "./money";
import { createHash } from "node:crypto";

export async function recordInvoicePayment(member: WorkspaceMember, id: string, input: PaymentInput) {
  const scope = { ...(await documentScope(member, true)), id, deletedAt: null };
  return prisma.$transaction(async (tx) => {
    // Serialize receipt recording with every write to this invoice. Both values are bound parameters.
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${id} AND "workspaceId" = ${member.workspaceId} AND "deletedAt" IS NULL FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: scope, select: { ...invoiceSelect, ownerId: true } });
    if (!invoice) throw new DocumentError("Invoice not found.", 404);
    if (input.currency && input.currency !== invoice.currency)
      throw new DocumentError("Payment currency must match the invoice. No FX conversion is performed.");
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const digest = createHash("sha256")
      .update(
        JSON.stringify({
          amount: input.amount,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          currency: invoice.currency,
          paidAt: input.paidAt ? paidAt.toISOString() : null,
        }),
      )
      .digest("hex");
    const previous = await tx.payment.findUnique({
      where: { invoiceId_requestId: { invoiceId: id, requestId: input.requestId } },
      select: { ...paymentSelect, requestDigest: true },
    });
    const { ownerId, ...visibleInvoice } = invoice;
    if (previous) {
      if (previous.requestDigest !== digest)
        throw new DocumentError("Payment request ID was already used for other content.", 409);
      const { requestDigest: _, ...payment } = previous;
      return { payment, invoice: { ...visibleInvoice, canWrite: true }, replayed: true };
    }
    assertVersion(invoice, input.updatedAt);
    if (["CANCELLED", "REFUNDED"].includes(invoice.status))
      throw new DocumentError("Cancelled/refunded invoices cannot receive payments.", 409);
    if (invoice.sendState === "SENDING")
      throw new DocumentError("Email send is in progress. Reload before recording payment.", 409);
    if (
      input.reference &&
      (await tx.payment.findFirst({
        where: { invoiceId: id, workspaceId: member.workspaceId, method: input.method, reference: input.reference },
        select: { id: true },
      }))
    )
      throw new DocumentError("This payment reference is already recorded for this invoice/method.", 409);
    let totals: ReturnType<typeof applyInvoicePayment>;
    try {
      totals = applyInvoicePayment(invoice.grandTotal.toString(), invoice.amountPaid.toString(), input.amount);
    } catch (error) {
      throw new DocumentError(error instanceof Error ? error.message : "Invalid payment amount.");
    }
    const payment = await tx.payment.create({
      data: {
        invoiceId: id,
        workspaceId: member.workspaceId,
        recordedById: member.userId,
        amount: input.amount,
        currency: invoice.currency,
        method: input.method,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        paidAt,
        requestId: input.requestId,
        requestDigest: digest,
      },
      select: paymentSelect,
    });
    const saved = await tx.invoice.update({
      where: { ...scope, updatedAt: new Date(input.updatedAt), amountPaid: invoice.amountPaid },
      data: { amountPaid: totals.amountPaid, status: totals.status },
      select: invoiceSelect,
    });
    await createAuditLog(
      {
        action: "CREATE",
        entityType: "Payment",
        entityId: payment.id,
        entityName: invoice.number,
        changes: { amount: { old: null, new: payment.amount }, invoiceId: { old: null, new: id } },
        userId: member.userId,
        workspaceId: member.workspaceId,
      },
      tx,
    );
    await createAuditLog(
      {
        action: "UPDATE",
        entityType: "Invoice",
        entityId: id,
        entityName: invoice.number,
        changes: {
          amountPaid: { old: invoice.amountPaid, new: saved.amountPaid },
          status: { old: invoice.status, new: saved.status },
        },
        userId: member.userId,
        workspaceId: member.workspaceId,
      },
      tx,
    );
    // Notify the owner only while their membership and related-record view rights still exist.
    let recipient = member.userId;
    if (ownerId !== member.userId) {
      const owner = await tx.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: ownerId, workspaceId: member.workspaceId } },
        select: { id: true },
      });
      const accessible =
        owner &&
        (
          await Promise.all(
            (
              [
                ["Contact", invoice.contactId],
                ["Company", invoice.companyId],
                ["Deal", invoice.dealId],
              ] as const
            ).map(([type, entityId]) =>
              entityId ? canAccess(ownerId, type, entityId, "VIEW", member.workspaceId) : true,
            ),
          )
        ).every(Boolean);
      if (accessible) recipient = ownerId;
    }
    await createNotification(
      {
        type: totals.fullyPaid ? "INVOICE_PAID" : "PAYMENT_RECEIVED",
        title: totals.fullyPaid ? "Invoice paid" : "Payment received",
        body: `${invoice.number}: ${input.amount} ${invoice.currency}. Balance: ${totals.balance} ${invoice.currency}.`,
        link: `/dashboard/invoices/${id}`,
        userId: recipient,
        workspaceId: member.workspaceId,
        metadata: { invoiceId: id, paymentId: payment.id, amount: input.amount, currency: invoice.currency },
      },
      tx,
    );
    if (totals.fullyPaid)
      await dispatchWebhooks(
        "invoice.paid",
        {
          id: saved.id,
          number: saved.number,
          currency: saved.currency,
          grandTotal: saved.grandTotal.toString(),
          amountPaid: saved.amountPaid.toString(),
          status: saved.status,
          paidAt: paidAt.toISOString(),
        },
        member.workspaceId,
        tx,
        `invoice.paid:${id}`,
      );
    return { payment, invoice: { ...saved, canWrite: true }, replayed: false };
  });
}
