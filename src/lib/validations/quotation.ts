import { z } from "zod";

import { createProductSchema } from "./product";

const id = z.string().trim().min(1).max(128);
const optionalText = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => value || null)
  .nullable()
  .optional();
const quantity = z
  .union([z.string().trim(), z.number().finite()])
  .transform(String)
  .pipe(
    z
      .string()
      .regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/, "Quantity must have at most 2 decimal places.")
      .refine((value) => Number(value) > 0, "Quantity must be positive."),
  );
export const lineItemSchema = z.strictObject({
  productId: id.nullable().optional(),
  description: z.string().trim().min(1).max(500),
  quantity,
  unitPrice: createProductSchema.shape.unitPrice,
  discount: createProductSchema.shape.taxRate.removeDefault().default("0"),
  taxRate: createProductSchema.shape.taxRate,
});
export const quotationStatuses = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "EXPIRED", "CONVERTED"] as const;
export const quotationFields = z
  .strictObject({
    contactId: id.nullable().optional(),
    companyId: id.nullable().optional(),
    dealId: id.nullable().optional(),
    issueDate: z.iso
      .date()
      .refine(
        (value) => Number(value.slice(0, 4)) >= 2000 && Number(value.slice(0, 4)) <= 2100,
        "Use a date between 2000 and 2100.",
      ),
    expiryDate: z.iso.date().nullable().optional(),
    currency: createProductSchema.shape.currency,
    lineItems: z.array(lineItemSchema).min(1).max(100),
    notes: optionalText,
    terms: optionalText,
  })
  .refine((value) => Boolean(value.contactId || value.companyId), "Choose a client.")
  .refine(
    (value) => !value.expiryDate || value.expiryDate >= value.issueDate,
    "Expiry cannot be before the issue date.",
  );
export const createQuotationSchema = quotationFields.safeExtend({ requestId: z.uuid() });
export const editQuotationSchema = quotationFields.safeExtend({ updatedAt: z.iso.datetime() });
export const statusQuotationSchema = z.strictObject({
  updatedAt: z.iso.datetime(),
  status: z.enum(["ACCEPTED", "DECLINED"]),
});
export const sendQuotationSchema = z.strictObject({ updatedAt: z.iso.datetime(), accountId: id });
export const versionSchema = z.strictObject({ updatedAt: z.iso.datetime() });
export const quotationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
  status: z.enum(quotationStatuses).optional(),
});
export type QuotationInput = z.output<typeof quotationFields>;
export type LineItemInput = z.output<typeof lineItemSchema>;
export type LineItemRow = LineItemInput & { id: string; total: string; position: number };
export type DocumentRow = {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  expiryDate?: string | null;
  dueDate?: string | null;
  currency: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  amountPaid?: string;
  quotationId?: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  notes: string | null;
  terms: string | null;
  clientName: string;
  clientEmail: string | null;
  issuerName: string;
  lineItems: LineItemRow[];
  sendState?: "IDLE" | "SENDING" | "SENT" | "UNCERTAIN";
  sentAt?: string | null;
  updatedAt: string;
  invoices?: { id: string; number: string }[];
  canWrite?: boolean;
};
