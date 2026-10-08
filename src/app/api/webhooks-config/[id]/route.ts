import { Prisma } from "@prisma/client";

import { createAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import {
  readWebhookConfigBody,
  webhookActor,
  webhookApiFailure,
  webhookHeaders,
  webhookSelect,
} from "@/lib/webhooks/access";
import { webhookPatchSchema } from "@/lib/webhooks/config";
import { outboundWebhookUrl, sealWebhookHeaders, sealWebhookSecret } from "@/lib/webhooks/security";

import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const webhook = await prisma.webhook.findFirst({
    where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
    select: webhookSelect,
  });
  return webhook
    ? Response.json({ webhook }, { headers: webhookHeaders })
    : Response.json({ error: "Webhook not found." }, { status: 404, headers: webhookHeaders });
}
export async function PATCH(request: Request, { params }: Context) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const parsed = webhookPatchSchema.safeParse(await readWebhookConfigBody(request));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid patch. Include current updatedAt." },
      { status: 400, headers: webhookHeaders },
    );
  const { updatedAt, rotateSecret, secret: supplied, headers, ...input } = parsed.data;
  if (input.url) {
    try {
      outboundWebhookUrl(input.url);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid endpoint." },
        { status: 400, headers: webhookHeaders },
      );
    }
  }
  const plainSecret = rotateSecret ? randomBytes(32).toString("hex") : supplied;
  const data: Prisma.WebhookUncheckedUpdateInput = input;
  try {
    if (plainSecret) data.secret = sealWebhookSecret(plainSecret);
    if (headers) data.headers = Object.keys(headers).length ? sealWebhookHeaders(headers) : Prisma.DbNull;
  } catch {
    return Response.json({ error: "Webhook encryption key unavailable." }, { status: 503, headers: webhookHeaders });
  }
  try {
    const webhook = await prisma.$transaction(async (tx) => {
      const updated = await tx.webhook.update({
        where: { id, workspaceId: actor.member.workspaceId, deletedAt: null, updatedAt: new Date(updatedAt) },
        data,
        select: webhookSelect,
      });
      await createAuditLog(
        {
          action: "UPDATE",
          entityType: "Webhook",
          entityId: id,
          entityName: updated.name,
          changes: {
            configuration: { old: updatedAt, new: updated.updatedAt.toISOString() },
            ...(plainSecret ? { signingSecret: { old: "configured", new: "rotated" } } : {}),
          },
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
      return updated;
    });
    return Response.json(
      { webhook, ...(plainSecret ? { signingSecret: plainSecret } : {}) },
      { headers: webhookHeaders },
    );
  } catch (error) {
    return webhookApiFailure(error);
  }
}
export async function DELETE(_request: Request, { params }: Context) {
  const actor = await webhookActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  try {
    await prisma.$transaction(async (tx) => {
      const removed = await tx.webhook.update({
        where: { id, workspaceId: actor.member.workspaceId, deletedAt: null },
        data: { isActive: false, deletedAt: new Date() },
        select: webhookSelect,
      });
      await tx.webhookDelivery.updateMany({
        where: { webhookId: id, status: { in: ["PENDING", "RETRYING"] }, leaseToken: null },
        data: { status: "FAILED", nextRetryAt: null, error: "Webhook deleted." },
      });
      await createAuditLog(
        {
          action: "DELETE",
          entityType: "Webhook",
          entityId: id,
          entityName: removed.name,
          userId: actor.member.userId,
          workspaceId: actor.member.workspaceId,
        },
        tx,
      );
    });
    return new Response(null, { status: 204, headers: webhookHeaders });
  } catch (error) {
    return webhookApiFailure(error);
  }
}
