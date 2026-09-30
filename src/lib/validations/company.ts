import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalUrl = z
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), "Use an http or https URL.")
  .nullable()
  .optional();

export const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Company name is required.").max(160),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, "Enter a domain like example.com.")
    .nullable()
    .optional(),
  industry: optionalText(120),
  size: optionalText(80),
  logoUrl: optionalUrl,
  website: optionalUrl,
  address: optionalText(500),
  description: optionalText(5000),
  phone: optionalText(80),
});

export const updateCompanySchema = createCompanySchema.partial();
