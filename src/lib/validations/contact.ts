import { z } from "zod";

const sourceSchema = z.enum(["MANUAL", "IMPORT", "WEBSITE", "REFERRAL", "LINKEDIN", "API"]);
const statusSchema = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);

export const createContactSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(120),
  lastName: z.string().trim().min(1, "Last name is required").max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  linkedinUrl: z
    .url({ protocol: /^https?$/ })
    .max(2048)
    .optional()
    .nullable(),
  notes_text: z.string().trim().max(10000).optional().nullable(),
  source: sourceSchema.default("MANUAL"),
  status: statusSchema.default("ACTIVE"),
  companyId: z.string().trim().min(1).max(128).optional().nullable(),
  ownerId: z.string().trim().min(1).max(128).optional().nullable(),
});

// In Zod 4, partial() retains inner defaults. Override them so PATCH changes only supplied fields.
export const updateContactSchema = createContactSchema.partial().safeExtend({
  source: sourceSchema.optional(),
  status: statusSchema.optional(),
});
