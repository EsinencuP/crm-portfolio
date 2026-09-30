import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code.");
const valueSchema = z
  .union([z.string(), z.number().finite().nonnegative()])
  .transform(String)
  .pipe(z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, "Enter an amount with up to two decimal places."));
const closeDateSchema = z
  .union([z.iso.date(), z.iso.datetime(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

export const createDealSchema = z.strictObject({
  title: z.string().trim().min(1, "Deal title is required.").max(200),
  value: valueSchema.nullable().optional(),
  currency: currencySchema.default("USD"),
  closeDate: closeDateSchema.nullable().optional(),
  priority: prioritySchema.default("MEDIUM"),
  description: z.string().trim().max(5000).nullable().optional(),
  stageId: idSchema,
  contactId: idSchema.nullable().optional(),
  companyId: idSchema.nullable().optional(),
  ownerId: idSchema.nullable().optional(),
});

// Zod 4 retains defaults inside partial(); PATCH must update only submitted fields.
export const updateDealSchema = createDealSchema.partial().safeExtend({
  currency: currencySchema.optional(),
  priority: prioritySchema.optional(),
});

export const changeDealStageSchema = z.strictObject({ stageId: idSchema });
