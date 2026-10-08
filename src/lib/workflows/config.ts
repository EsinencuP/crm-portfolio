import { z } from "zod";

import { canvasSchema, validateWorkflowGraph } from "./graph";

export const triggers = [
  "CONTACT_CREATED",
  "CONTACT_UPDATED",
  "DEAL_CREATED",
  "DEAL_STAGE_CHANGED",
  "DEAL_WON",
  "DEAL_LOST",
  "ACTIVITY_COMPLETED",
  "FORM_SUBMITTED",
  "EMAIL_RECEIVED",
  "EMAIL_OPENED",
  "MANUAL",
  "SCHEDULED",
] as const;
export const entities = ["Contact", "Deal", "Activity", "EmailMessage"] as const;
export type WorkflowEntity = (typeof entities)[number];
const id = z.string().min(1).max(128);
const scalar = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
export const conditionFields = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "source",
  "status",
  "ownerId",
  "stageId",
  "oldStage",
  "newStage",
  "value",
  "currency",
  "priority",
  "title",
  "type",
  "completed",
  "formId",
  "subject",
  "direction",
] as const;
export const conditionsSchema = z
  .array(
    z
      .object({
        field: z.enum(conditionFields),
        operator: z.enum(["equals", "not_equals", "contains", "gt", "lt"]),
        value: scalar,
      })
      .strict(),
  )
  .max(20);
export const triggerConfigSchema = z
  .object({
    entityType: z.enum(entities).optional(),
    conditions: conditionsSchema.default([]),
    entityId: id.optional(),
    intervalMinutes: z.number().int().min(1).max(43200).optional(),
  })
  .strict();
const title = z.string().trim().min(1).max(200);
const routingShape = {
  nodeId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,100}$/)
    .optional(),
  nextPosition: z.number().int().min(-1).max(49).optional(),
  elsePosition: z.number().int().min(-1).max(49).optional(),
};
export const webhookConfigSchema = z
  .object({
    url: z
      .string()
      .max(2048)
      .pipe(z.url({ protocol: /^https$/ })),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
    headers: z
      .record(
        z.string().regex(/^[A-Za-z0-9-]{1,64}$/),
        z
          .string()
          .max(2048)
          .refine((value) => !/[\r\n]/.test(value)),
      )
      .default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const keys = Object.keys(config.headers).map((key) => key.toLowerCase());
    if (
      keys.length > 20 ||
      new Set(keys).size !== keys.length ||
      keys.some((key) =>
        [
          "host",
          "connection",
          "content-length",
          "transfer-encoding",
          "upgrade",
          "cookie",
          "content-type",
          "idempotency-key",
        ].includes(key),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Headers contain duplicates, reserved names or too many entries.",
        path: ["headers"],
      });
  });
export const stepSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("CONDITION"),
      config: z.object({ conditions: conditionsSchema }).strict(),
      ...routingShape,
    })
    .strict(),
  z
    .object({
      type: z.literal("SEND_EMAIL"),
      ...routingShape,
      config: z
        .object({
          accountId: id,
          subject: title,
          bodyHtml: z.string().min(1).max(50000),
          trackingEnabled: z.boolean().default(false),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CREATE_TASK"),
      ...routingShape,
      config: z
        .object({
          title,
          description: z.string().max(5000).optional(),
          userId: id.optional(),
          dueInMinutes: z.number().int().min(0).max(525600).default(1440),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("UPDATE_FIELD"),
      ...routingShape,
      config: z
        .object({
          field: z.enum([
            "firstName",
            "lastName",
            "email",
            "phone",
            "jobTitle",
            "city",
            "country",
            "notes_text",
            "status",
            "source",
            "title",
            "description",
            "value",
            "currency",
            "priority",
            "completed",
            "dueDate",
          ]),
          value: scalar,
        })
        .strict(),
    })
    .strict(),
  z.object({ type: z.literal("ASSIGN_OWNER"), config: z.object({ userId: id }).strict(), ...routingShape }).strict(),
  z.object({ type: z.literal("ADD_TAG"), config: z.object({ tagId: id }).strict(), ...routingShape }).strict(),
  z.object({ type: z.literal("MOVE_STAGE"), config: z.object({ stageId: id }).strict(), ...routingShape }).strict(),
  z
    .object({
      type: z.literal("SEND_NOTIFICATION"),
      ...routingShape,
      config: z.object({ title, body: z.string().max(2000).optional(), userId: id.optional() }).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("CALL_WEBHOOK"),
      ...routingShape,
      config: webhookConfigSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("WAIT"),
      config: z.object({ duration: z.number().int().min(1).max(2592000) }).strict(),
      ...routingShape,
    })
    .strict(),
]);
export type WorkflowStepInput = z.infer<typeof stepSchema>;
export const workflowSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).nullable().default(null),
    trigger: z.enum(triggers),
    triggerConfig: triggerConfigSchema.default({ conditions: [] }),
    isActive: z.boolean().default(true),
    steps: z.array(stepSchema).min(1).max(50),
    canvas: canvasSchema.nullable().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    try {
      validateWorkflowGraph(input.steps, input.canvas);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid workflow graph.",
        path: ["canvas"],
      });
    }
    if (
      input.trigger === "SCHEDULED" &&
      (!input.triggerConfig.entityType || !input.triggerConfig.entityId || !input.triggerConfig.intervalMinutes)
    )
      ctx.addIssue({
        code: "custom",
        message: "Scheduled workflows require entityType, entityId and intervalMinutes.",
        path: ["triggerConfig"],
      });
  });

export function evaluateTriggerConditions(config: unknown, data: unknown): boolean {
  const parsed = triggerConfigSchema.safeParse(config);
  if (!parsed.success || !data || typeof data !== "object") return false;
  const values = data as Record<string, unknown>;
  return parsed.data.conditions.every((condition) => {
    if (!Object.hasOwn(values, condition.field)) return false;
    const value = values[condition.field];
    if (condition.operator === "equals") return value === condition.value;
    if (condition.operator === "not_equals") return value !== condition.value;
    if (condition.operator === "contains")
      return typeof value === "string" && typeof condition.value === "string" && value.includes(condition.value);
    const numeric = (input: unknown) =>
      typeof input === "number" || (typeof input === "string" && input.trim() !== "") ? Number(input) : Number.NaN;
    const left = numeric(value);
    const right = numeric(condition.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    return condition.operator === "gt" ? left > right : left < right;
  });
}
export function renderTemplate(template: string, data: Record<string, unknown>, html = false) {
  return template.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_match, field: string) => {
    if (!Object.hasOwn(data, field)) throw new Error(`Unknown template variable: ${field}`);
    const value = data[field];
    const text = value == null ? "" : String(value);
    return html
      ? text.replace(
          /[&<>"']/g,
          (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
        )
      : text;
  });
}
