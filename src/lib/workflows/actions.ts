import "server-only";

import type { Prisma, WorkspaceMember } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/email/send";
import { createNotification } from "@/lib/notifications";
import { createActivitySchema, updateActivitySchema } from "@/lib/validations/activity";
import { createContactSchema } from "@/lib/validations/contact";
import { updateDealSchema } from "@/lib/validations/deal";

import { entityAccess, loadEntity, type WorkflowDb } from "./access";
import { evaluateTriggerConditions, renderTemplate, type WorkflowEntity, type WorkflowStepInput } from "./config";
import { postWorkflowWebhook } from "./webhook";

export type ActionContext = {
  db: WorkflowDb;
  member: WorkspaceMember;
  entityType: WorkflowEntity;
  entityId: string;
  runId: string;
  step: number;
  data: Record<string, unknown>;
};
async function writable(context: ActionContext, level: "EDIT" | "FULL" = "EDIT") {
  if (!(await entityAccess(context.db, context.member, context.entityType, context.entityId, level)))
    throw new Error("Workflow record access denied.");
  const entity = await loadEntity(context.db, context.entityType, context.entityId, context.member.workspaceId);
  if (!entity) throw new Error("Workflow record no longer exists.");
  return entity;
}
async function memberTarget(context: ActionContext, userId: string) {
  const member = await context.db.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: context.member.workspaceId } },
  });
  if (!member || member.role === "VIEWER") throw new Error("Target owner must be a writable workspace member.");
  return member;
}
async function links(context: ActionContext) {
  const entity = await writable(context);
  const contactId =
    context.entityType === "Contact" ? context.entityId : "contactId" in entity ? entity.contactId : null;
  const dealId = context.entityType === "Deal" ? context.entityId : "dealId" in entity ? entity.dealId : null;
  if (contactId && !(await entityAccess(context.db, context.member, "Contact", contactId)))
    throw new Error("Related contact access denied.");
  if (dealId && !(await entityAccess(context.db, context.member, "Deal", dealId)))
    throw new Error("Related deal access denied.");
  return { contactId, dealId };
}
async function audit(
  context: ActionContext,
  entityType: string,
  entityId: string,
  action: "CREATE" | "UPDATE",
  changes?: Record<string, { old: unknown; new: unknown }>,
) {
  await createAuditLog(
    { userId: context.member.userId, workspaceId: context.member.workspaceId, entityType, entityId, action, changes },
    context.db,
  );
}
export async function executeSendEmail(
  config: Extract<WorkflowStepInput, { type: "SEND_EMAIL" }>["config"],
  context: ActionContext,
) {
  const related = await links(context);
  if (!related.contactId) throw new Error("Email action requires an accessible related contact.");
  const contact = await context.db.contact.findFirst({
    where: { id: related.contactId, workspaceId: context.member.workspaceId },
    select: { email: true },
  });
  if (!contact?.email) throw new Error("Contact has no email address.");
  const subject = renderTemplate(config.subject, context.data);
  if (subject.length > 200 || /[\r\n]/.test(subject)) throw new Error("Invalid rendered email subject.");
  const message = await sendEmail({
    ...config,
    subject,
    bodyHtml: renderTemplate(config.bodyHtml, context.data, true),
    to: [contact.email],
    contactId: related.contactId,
    dealId: related.dealId ?? undefined,
    userId: context.member.userId,
    workspaceId: context.member.workspaceId,
  });
  return { messageId: message.id };
}
export async function executeCreateTask(
  config: Extract<WorkflowStepInput, { type: "CREATE_TASK" }>["config"],
  context: ActionContext,
) {
  const related = await links(context);
  const ownerId = config.userId ?? context.member.userId;
  const target = await memberTarget(context, ownerId);
  if (related.contactId && !(await entityAccess(context.db, target, "Contact", related.contactId, "VIEW")))
    throw new Error("Task owner cannot view the contact.");
  if (related.dealId && !(await entityAccess(context.db, target, "Deal", related.dealId, "VIEW")))
    throw new Error("Task owner cannot view the deal.");
  const input = createActivitySchema.parse({
    type: "TASK",
    title: renderTemplate(config.title, context.data),
    description: config.description ? renderTemplate(config.description, context.data) : null,
    ownerId,
    contactId: related.contactId,
    dealId: related.dealId,
    dueDate: new Date(Date.now() + config.dueInMinutes * 60000).toISOString(),
  });
  const task = await context.db.activity.create({
    data: { ...input, ownerId, workspaceId: context.member.workspaceId },
  });
  await audit(context, "Activity", task.id, "CREATE");
  return { activityId: task.id };
}
export async function executeUpdateField(
  config: Extract<WorkflowStepInput, { type: "UPDATE_FIELD" }>["config"],
  context: ActionContext,
) {
  const entity = await writable(context);
  const input = { [config.field]: config.value };
  const where = { id: context.entityId, workspaceId: context.member.workspaceId };
  if (context.entityType === "Contact") {
    const allowed = [
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
    ];
    if (!allowed.includes(config.field)) throw new Error("Field is not editable on a contact.");
    const parsed = createContactSchema
      .omit({ ownerId: true, companyId: true })
      .partial()
      .safeExtend({
        source: createContactSchema.shape.source.removeDefault().optional(),
        status: createContactSchema.shape.status.removeDefault().optional(),
      })
      .parse(input);
    await context.db.contact.update({ where, data: parsed });
  } else if (context.entityType === "Deal") {
    if (!["title", "description", "value", "currency", "priority"].includes(config.field))
      throw new Error("Field is not editable on a deal.");
    await context.db.deal.update({ where, data: updateDealSchema.parse(input) });
  } else if (context.entityType === "Activity") {
    if (!["title", "description", "completed", "dueDate"].includes(config.field))
      throw new Error("Field is not editable on an activity.");
    await context.db.activity.update({
      where,
      data: {
        ...updateActivitySchema.parse(input),
        ...(config.field === "completed" ? { completedAt: config.value ? new Date() : null } : {}),
      },
    });
  } else throw new Error("Email message fields cannot be edited by workflows.");
  await audit(context, context.entityType, context.entityId, "UPDATE", {
    [config.field]: { old: (entity as unknown as Record<string, unknown>)[config.field], new: config.value },
  });
  return { updated: config.field };
}
export async function executeAssignOwner(config: { userId: string }, context: ActionContext) {
  const entity = await writable(context, "FULL");
  await memberTarget(context, config.userId);
  const where = { id: context.entityId, workspaceId: context.member.workspaceId };
  if (context.entityType === "Contact") await context.db.contact.update({ where, data: { ownerId: config.userId } });
  else if (context.entityType === "Deal") await context.db.deal.update({ where, data: { ownerId: config.userId } });
  else if (context.entityType === "Activity") {
    const target = await memberTarget(context, config.userId);
    const related = await links(context);
    if (
      (related.contactId && !(await entityAccess(context.db, target, "Contact", related.contactId, "VIEW"))) ||
      (related.dealId && !(await entityAccess(context.db, target, "Deal", related.dealId, "VIEW")))
    )
      throw new Error("Owner cannot view related records.");
    await context.db.activity.update({ where, data: { ownerId: config.userId } });
  } else throw new Error("Cannot assign an email message owner.");
  await audit(context, context.entityType, context.entityId, "UPDATE", {
    ownerId: { old: "ownerId" in entity ? entity.ownerId : null, new: config.userId },
  });
  return { assigned: true };
}
export async function executeMoveStage(config: { stageId: string }, context: ActionContext) {
  const entity = await writable(context);
  if (
    context.entityType !== "Deal" ||
    !(await context.db.pipelineStage.count({ where: { id: config.stageId, workspaceId: context.member.workspaceId } }))
  )
    throw new Error("Deal stage must belong to this workspace.");
  await context.db.deal.update({
    where: { id: context.entityId, workspaceId: context.member.workspaceId },
    data: { stageId: config.stageId },
  });
  await audit(context, "Deal", context.entityId, "UPDATE", {
    stageId: { old: "stageId" in entity ? entity.stageId : null, new: config.stageId },
  });
  return { moved: true };
}
export async function executeSendNotification(
  config: Extract<WorkflowStepInput, { type: "SEND_NOTIFICATION" }>["config"],
  context: ActionContext,
) {
  await writable(context);
  const recipient = await memberTarget(context, config.userId ?? context.member.userId);
  if (!(await entityAccess(context.db, recipient, context.entityType, context.entityId, "VIEW")))
    throw new Error("Notification recipient cannot view this record.");
  if (
    typeof context.data.relatedContactId === "string" &&
    !(await entityAccess(context.db, recipient, "Contact", context.data.relatedContactId, "VIEW"))
  )
    throw new Error("Notification recipient cannot view the related contact.");
  const notification = await createNotification(
    {
      type: "SYSTEM",
      title: renderTemplate(config.title, context.data).slice(0, 200),
      body: config.body ? renderTemplate(config.body, context.data).slice(0, 2000) : undefined,
      userId: recipient.userId,
      workspaceId: context.member.workspaceId,
      link: "/dashboard/notifications",
      metadata: { runId: context.runId },
    },
    context.db,
  );
  return { notificationId: notification.id };
}
export async function executeCallWebhook(
  config: { url: string; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; headers?: Record<string, string> },
  context: ActionContext,
) {
  await writable(context);
  const status = await postWorkflowWebhook(
    config.url,
    {
      event: "workflow",
      runId: context.runId,
      entityType: context.entityType,
      entityId: context.entityId,
      data: context.data,
    },
    `${context.runId}-${context.step}`,
    config,
  );
  return { httpStatus: status };
}
export function executeWait(config: { duration: number }) {
  return new Date(Date.now() + config.duration * 1000);
}
export async function executeDatabaseAction(
  step: WorkflowStepInput,
  context: ActionContext,
): Promise<Prisma.InputJsonObject> {
  switch (step.type) {
    case "CONDITION":
      return { continue: evaluateTriggerConditions({ conditions: step.config.conditions }, context.data) };
    case "CREATE_TASK":
      return executeCreateTask(step.config, context);
    case "UPDATE_FIELD":
      return executeUpdateField(step.config, context);
    case "ASSIGN_OWNER":
      return executeAssignOwner(step.config, context);
    case "MOVE_STAGE":
      return executeMoveStage(step.config, context);
    case "SEND_NOTIFICATION":
      return executeSendNotification(step.config, context);
    case "ADD_TAG": {
      await writable(context);
      if (!(await context.db.tag.count({ where: { id: step.config.tagId, workspaceId: context.member.workspaceId } })))
        throw new Error("Tag not in workflow workspace.");
      const where = { id: context.entityId, workspaceId: context.member.workspaceId };
      const data = { tags: { connect: { id: step.config.tagId } } };
      if (context.entityType === "Contact") await context.db.contact.update({ where, data });
      else if (context.entityType === "Deal") await context.db.deal.update({ where, data });
      else throw new Error("Tags require a contact or deal.");
      await audit(context, context.entityType, context.entityId, "UPDATE", {
        tagId: { old: null, new: step.config.tagId },
      });
      return { tagged: true };
    }
    default:
      throw new Error("This action requires external execution or delayed continuation.");
  }
}
