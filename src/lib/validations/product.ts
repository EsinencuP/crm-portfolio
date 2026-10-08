import { z } from "zod";

export const productUnits = ["unit", "hour", "month", "license"] as const;
export const productCurrencies = ["USD", "EUR", "GBP", "RON", "MDL", "CHF", "JPY", "CAD", "AUD"] as const;
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();
const decimal = z.union([z.string().trim(), z.number().finite()]).transform(String);
const unitPrice = decimal.pipe(
  z
    .string()
    .regex(
      /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
      "Enter a non-negative amount with up to 10 integer digits and 2 decimal places.",
    ),
);
const taxRate = decimal.pipe(
  z
    .string()
    .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/, "Enter a tax rate with up to 2 decimal places.")
    .refine((value) => Number(value) <= 100, "Tax rate must be between 0 and 100%."),
);
const currency = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code.")
  .refine((value) => Intl.supportedValuesOf("currency").includes(value), "Use a supported ISO currency code.");
const imageUrl = optionalText(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Use an HTTPS image URL without credentials.");
export const createProductSchema = z.strictObject({
  name: z.string().trim().min(1, "Product name is required.").max(160),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .max(80)
    .refine(
      (value) => Array.from(value).every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127),
      "SKU cannot contain control characters.",
    )
    .transform((value) => value || null)
    .nullable()
    .optional(),
  description: optionalText(5000),
  unitPrice,
  currency: currency.default("USD"),
  unit: z.enum(productUnits).default("unit"),
  taxRate: taxRate.default("0"),
  isActive: z.boolean().default(true),
  category: optionalText(120),
  imageUrl,
});
// Zod 4 partial() retains inner defaults: PATCH must not overwrite omitted values.
export const updateProductSchema = createProductSchema
  .partial()
  .safeExtend({
    currency: currency.optional(),
    unit: z.enum(productUnits).optional(),
    taxRate: taxRate.optional(),
    isActive: z.boolean().optional(),
    updatedAt: z.iso.datetime(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "updatedAt"),
    "Provide at least one product field to update.",
  );
export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).default(""),
  category: z.string().trim().max(120).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z.enum(["name", "sku", "unitPrice", "unit", "category", "isActive", "createdAt"]).default("name"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  unitPrice: string;
  currency: string;
  unit: string;
  taxRate: string;
  isActive: boolean;
  category: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ProductList = {
  products: ProductRow[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  categories: string[];
};
