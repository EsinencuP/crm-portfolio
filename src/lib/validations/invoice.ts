import { z } from "zod";

import { createProductSchema } from "./product";
import { quotationFields } from "./quotation";

const { expiryDate: _, ...fields } = quotationFields.shape;
export const invoiceStatuses = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
] as const;
export const invoiceFields = z
  .strictObject({ ...fields, dueDate: z.iso.date().nullable().optional() })
  .refine((value) => Boolean(value.contactId || value.companyId), "Choose a client.")
  .refine((value) => !value.dueDate || value.dueDate >= value.issueDate, "Due date cannot be before the issue date.");
export const createInvoiceSchema = invoiceFields.safeExtend({ requestId: z.uuid() });
export const editInvoiceSchema = invoiceFields.safeExtend({ updatedAt: z.iso.datetime() });
export const cancelInvoiceSchema = z.strictObject({ status: z.literal("CANCELLED"), updatedAt: z.iso.datetime() });
export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(invoiceStatuses).optional(),
});
export const paymentMethods = ["BANK_TRANSFER", "CREDIT_CARD", "PAYPAL", "STRIPE", "CASH", "CHECK", "OTHER"] as const;
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();
export const recordPaymentSchema = z.strictObject({
  amount: createProductSchema.shape.unitPrice.refine((value) => Number(value) > 0, "Payment must be positive."),
  currency: createProductSchema.shape.currency.removeDefault().optional(),
  method: z.enum(paymentMethods),
  reference: optionalText(200),
  notes: optionalText(2000),
  paidAt: z
    .union([z.iso.date(), z.iso.datetime({ offset: true })])
    .refine((value) => Number(value.slice(0, 4)) >= 2000, "Use a date from 2000 onward.")
    .refine((value) => new Date(value).getTime() <= Date.now(), "Payment date cannot be in the future.")
    .optional(),
  requestId: z.uuid(),
  updatedAt: z.iso.datetime(),
});
export type InvoiceInput = z.output<typeof invoiceFields>;
export type PaymentInput = z.output<typeof recordPaymentSchema>;
export type PaymentRow = {
  id: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  createdAt: string;
};
