import { z } from "zod";

export const fieldTypes = ["text", "email", "phone", "select", "textarea", "checkbox"] as const;
const mappedTypes: Record<string, string> = {
  firstName: "text",
  lastName: "text",
  email: "email",
  phone: "phone",
  message: "textarea",
};
const mappedLimits: Record<string, number> = { firstName: 120, lastName: 120, email: 254, phone: 50 };
export const formFieldSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
      .refine((name) => !["constructor", "prototype", "__proto__"].includes(name)),
    type: z.enum(fieldTypes),
    label: z.string().trim().min(1).max(160),
    required: z.boolean(),
    placeholder: z.string().max(200).default(""),
    options: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "select" && (!field.options?.length || new Set(field.options).size !== field.options.length))
      ctx.addIssue({ code: "custom", message: "Select fields need distinct, non-empty options.", path: ["options"] });
    const mappedType = mappedTypes[field.name];
    if (mappedType && field.type !== mappedType)
      ctx.addIssue({ code: "custom", message: `${field.name} must use the ${mappedType} type.`, path: ["type"] });
  });
export const fieldsSchema = z
  .array(formFieldSchema)
  .min(1)
  .max(30)
  .refine((fields) => new Set(fields.map((field) => field.name)).size === fields.length, "Field names must be unique.");
export const styleSchema = z
  .object({
    theme: z.enum(["light", "dark"]).default("light"),
    primaryColor: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .default("#2563eb"),
    layout: z.enum(["stacked", "two-column"]).default("stacked"),
  })
  .strict();
export const formConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    slug: z
      .string()
      .min(3)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().max(2000).nullable().default(null),
    fields: fieldsSchema,
    style: styleSchema.default({ theme: "light", primaryColor: "#2563eb", layout: "stacked" }),
    thankyouMessage: z.string().trim().min(1).max(2000).default("Thank you! We'll be in touch."),
    redirectUrl: z
      .string()
      .max(2048)
      .pipe(z.url({ protocol: /^https?$/ }))
      .nullable()
      .default(null),
    assignToId: z.string().min(1).max(128).nullable().default(null),
    tagIds: z
      .array(z.string().min(1).max(128))
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
    pipelineStageId: z.string().min(1).max(128).nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .strict();
export type FormField = z.infer<typeof formFieldSchema>;
export type FormConfig = z.infer<typeof formConfigSchema>;
export type PublicFormConfig = Pick<FormConfig, "name" | "slug" | "description" | "fields" | "style">;
export const defaultFields: FormField[] = [
  { name: "firstName", label: "First name", type: "text", required: true, placeholder: "" },
  { name: "lastName", label: "Last name", type: "text", required: false, placeholder: "" },
  { name: "email", label: "Email", type: "email", required: true, placeholder: "you@example.com" },
  { name: "phone", label: "Phone", type: "phone", required: false, placeholder: "" },
  { name: "message", label: "Message", type: "textarea", required: false, placeholder: "How can we help?" },
];

export function submissionSchema(fields: FormField[]) {
  const shape: Record<string, z.ZodType> = Object.create(null);
  for (const field of fields) {
    if (field.type === "checkbox") {
      shape[field.name] = field.required
        ? z.literal(true, { error: "Please check this box." })
        : z.boolean().default(false);
      continue;
    }
    const limit = mappedLimits[field.name] ?? (field.type === "textarea" ? 10000 : 500);
    let value = z.string().trim().max(limit);
    if (field.required) value = value.min(1, "This field is required.");
    if (field.type === "email")
      value = value.refine((text) => !text || z.email().safeParse(text).success, "Enter a valid email.");
    if (field.type === "select")
      value = value.refine(
        (text) => (!field.required && !text) || Boolean(field.options?.includes(text)),
        "Choose a listed option.",
      );
    shape[field.name] = field.required ? value : value.default("");
  }
  return z.object(shape).strict();
}
