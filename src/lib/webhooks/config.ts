import { z } from "zod";

export const webhookEvents = [
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "activity.completed",
  "form.submitted",
  "email.received",
  "email.opened",
  "invoice.paid",
] as const;
export const retryDelays = [60000, 300000, 1800000] as const;
export const maxDeliveryAttempts = retryDelays.length + 1;
export const customHeadersSchema = z
  .record(
    z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
    z
      .string()
      .max(2048)
      .refine((value) => !/[\r\n]/.test(value)),
  )
  .superRefine((headers, ctx) => {
    const keys = Object.keys(headers).map((key) => key.toLowerCase());
    if (
      keys.length > 20 ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) =>
          [
            "host",
            "connection",
            "content-length",
            "transfer-encoding",
            "upgrade",
            "cookie",
            "content-type",
            "idempotency-key",
          ].includes(key) || key.startsWith("x-webhook-"),
      )
    )
      ctx.addIssue({ code: "custom", message: "Custom headers contain reserved/duplicate names or too many entries." });
  });
export const webhookCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    url: z
      .string()
      .max(2048)
      .pipe(z.url({ protocol: /^https$/ })),
    events: z
      .array(z.enum(webhookEvents))
      .min(1)
      .max(webhookEvents.length)
      .refine((events) => new Set(events).size === events.length),
    secret: z.string().min(16).max(256).optional(),
    headers: customHeadersSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export const webhookPatchSchema = webhookCreateSchema
  .partial()
  .safeExtend({ isActive: z.boolean().optional(), rotateSecret: z.boolean().optional(), updatedAt: z.iso.datetime() })
  .superRefine((input, ctx) => {
    if (input.secret && input.rotateSecret)
      ctx.addIssue({ code: "custom", message: "Provide a secret or rotate it, not both." });
  });
