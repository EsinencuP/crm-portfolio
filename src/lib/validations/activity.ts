import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const dueDate = z
  .union([z.iso.date(), z.iso.datetime(), z.iso.datetime({ offset: true })])
  .transform((value) => new Date(value));

export const createActivitySchema = z.strictObject({
  type: z.enum(["CALL", "EMAIL", "MEETING", "TASK", "NOTE", "FOLLOW_UP"]),
  title: z.string().trim().min(1, "Title is required.").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
  completed: z.boolean().default(false),
  contactId: id.nullable().optional(),
  dealId: id.nullable().optional(),
  ownerId: id.optional(),
});

export const updateActivitySchema = createActivitySchema.partial().safeExtend({ completed: z.boolean().optional() });
