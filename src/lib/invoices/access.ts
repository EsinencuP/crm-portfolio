import "server-only";
import type { Prisma } from "@prisma/client";

import { DocumentError, documentSelect } from "@/lib/quotations/access";
export const invoiceSelect = {
  ...documentSelect,
  dueDate: true,
  amountPaid: true,
  sendState: true,
  sentAt: true,
  quotationId: true,
} satisfies Prisma.InvoiceSelect;
export const paymentSelect = {
  id: true,
  amount: true,
  currency: true,
  method: true,
  status: true,
  reference: true,
  paidAt: true,
  notes: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;
export type SavedInvoice = Prisma.InvoiceGetPayload<{ select: typeof invoiceSelect }>;
export function assertInvoiceDraft(invoice: { status: string; sendState: string; amountPaid: { toString(): string } }) {
  if (invoice.status !== "DRAFT" || invoice.sendState !== "IDLE" || Number(invoice.amountPaid.toString()) !== 0)
    throw new DocumentError("Only an unsent draft without payments can be changed.", 409);
}
