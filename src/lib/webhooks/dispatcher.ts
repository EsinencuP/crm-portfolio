import "server-only";

import { Prisma, type Webhook } from "@prisma/client";
import type { Queue } from "bullmq";

import prisma from "@/lib/prisma";

import type { WebhookDb } from "./access";
import { maxDeliveryAttempts, retryDelays, webhookEvents } from "./config";
import { outboundWebhookUrl, unsealWebhookHeaders, unsealWebhookSecret, webhookSignature } from "./security";
import { postWebhook, type WebhookResponse } from "./transport";
import { createHash, randomUUID } from "node:crypto";

export async function createWebhookDelivery(
  webhook: Webhook,
  event: string,
  data: unknown,
  eventKey: string,
  isTest = false,
  db: WebhookDb = prisma,
) {
  const id = randomUUID();
  const key = createHash("sha256").update(`${event}|${webhook.workspaceId}|${eventKey}`).digest("hex");
  const payloadText = JSON.stringify({
    id: key,
    event,
    createdAt: new Date().toISOString(),
    workspaceId: webhook.workspaceId,
    data,
  });
  if (Buffer.byteLength(payloadText) > 262144) throw new Error("Webhook payload exceeds 256 KiB.");
  const created = await db.webhookDelivery.createMany({
    data: [
      {
        id,
        webhookId: webhook.id,
        event,
        eventKey: key,
        payload: JSON.parse(payloadText) as Prisma.InputJsonValue,
        payloadText,
        endpointUrl: webhook.url,
        signingSecret: webhook.secret,
        requestHeaders: webhook.headers ?? Prisma.DbNull,
        isTest,
        status: "PENDING",
      },
    ],
    skipDuplicates: true,
  });
  if (created.count) return id;
  const previous = await db.webhookDelivery.findUniqueOrThrow({
    where: { webhookId_eventKey: { webhookId: webhook.id, eventKey: key } },
    select: { id: true },
  });
  return previous.id;
}
export async function dispatchWebhooks(
  event: string,
  payload: Record<string, unknown>,
  workspaceId: string,
  db?: WebhookDb,
  eventKey: string = randomUUID(),
): Promise<string[]> {
  if (!webhookEvents.some((name) => name === event)) throw new Error("Unsupported webhook event.");
  if (!db) return prisma.$transaction((tx) => dispatchWebhooks(event, payload, workspaceId, tx, eventKey));
  const endpoints = await db.webhook.findMany({
    where: { workspaceId, isActive: true, deletedAt: null, events: { has: event } },
  });
  const ids: string[] = [];
  for (const endpoint of endpoints)
    ids.push(await createWebhookDelivery(endpoint, event, payload, eventKey, false, db));
  return ids;
}
export function retryAt(attempts: number, now = Date.now()) {
  return attempts < maxDeliveryAttempts ? new Date(now + retryDelays[attempts - 1]) : null;
}
function redactResponse(body: string, sensitive: string[]) {
  let result = body.slice(0, 2000);
  for (const value of sensitive) if (value.length >= 4) result = result.split(value).join("[redacted]");
  return result.slice(0, 2000);
}
export async function deliverWebhook(deliveryId: string, transport: typeof postWebhook = postWebhook) {
  const token = randomUUID();
  const now = new Date();
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ["PENDING", "RETRYING"] },
      AND: [
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      ],
    },
    data: { leaseToken: token, leaseExpiresAt: new Date(now.getTime() + 60000) },
  });
  if (!claimed.count) return;
  const delivery = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "WebhookDelivery" WHERE "id" = ${deliveryId} FOR UPDATE`;
    const current = await tx.webhookDelivery.findFirst({
      where: { id: deliveryId, leaseToken: token },
      include: { webhook: true },
    });
    if (!current) return null;
    if (
      current.webhook.deletedAt ||
      (!current.webhook.isActive && !current.isTest) ||
      current.attempts >= maxDeliveryAttempts
    ) {
      await tx.webhookDelivery.update({
        where: { id: deliveryId, leaseToken: token },
        data: {
          status: "FAILED",
          error: "Webhook disabled/deleted or attempt limit reached.",
          nextRetryAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      return null;
    }
    // A crashed attempt has an unknown outcome; retry only after its backoff.
    if (current.attempts > 0 && current.nextRetryAt == null) {
      await tx.webhookDelivery.update({
        where: { id: deliveryId, leaseToken: token },
        data: {
          status: "RETRYING",
          error: "Previous attempt interrupted; receiver must deduplicate delivery IDs.",
          nextRetryAt: retryAt(current.attempts),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      return null;
    }
    const prepared = await tx.webhookDelivery.update({
      where: { id: deliveryId, leaseToken: token },
      data: { attempts: { increment: 1 }, nextRetryAt: null },
    });
    return { ...prepared, webhook: current.webhook };
  });
  if (!delivery) return;
  let response: WebhookResponse | null = null;
  let error: string | null = null;
  const started = Date.now();
  const secrets: string[] = [];
  try {
    outboundWebhookUrl(delivery.endpointUrl);
    if (!delivery.signingSecret) throw new Error("Signing credentials unavailable.");
    const secret = unsealWebhookSecret(delivery.signingSecret);
    secrets.push(secret);
    const customHeaders = unsealWebhookHeaders(delivery.requestHeaders);
    secrets.push(...Object.values(customHeaders));
    const headers = {
      ...customHeaders,
      "X-Webhook-Signature": webhookSignature(delivery.payloadText, secret),
      "X-Webhook-Event": delivery.event,
      "X-Webhook-Delivery-Id": delivery.id,
      "Idempotency-Key": delivery.id,
    };
    response = await transport(delivery.endpointUrl, delivery.payloadText, headers);
    if (response.status < 200 || response.status >= 300) error = `Endpoint returned HTTP ${response.status}.`;
  } catch {
    error = "Delivery failed: endpoint/credentials unavailable, network timeout or blocked destination.";
  }
  const success = response != null && response.status >= 200 && response.status < 300;
  const next = success ? null : retryAt(delivery.attempts);
  let status: "SUCCESS" | "RETRYING" | "FAILED" = "FAILED";
  if (success) status = "SUCCESS";
  else if (next) status = "RETRYING";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "WebhookDelivery" WHERE "id" = ${deliveryId} FOR UPDATE`;
    const owned = await tx.webhookDelivery.findFirst({ where: { id: deliveryId, leaseToken: token } });
    if (!owned) return;
    await tx.webhookDelivery.update({
      where: { id: deliveryId, leaseToken: token },
      data: {
        status,
        responseCode: response?.status ?? null,
        responseBody: response ? redactResponse(response.body, secrets) : null,
        duration: response?.duration ?? Date.now() - started,
        error,
        nextRetryAt: next,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    await tx.$queryRaw`SELECT "id" FROM "Webhook" WHERE "id" = ${delivery.webhookId} FOR UPDATE`;
    const endpoint = await tx.webhook.findUnique({ where: { id: delivery.webhookId }, select: { updatedAt: true } });
    if (endpoint)
      await tx.webhook.update({
        where: { id: delivery.webhookId },
        data: { lastTriggeredAt: new Date(), failCount: success ? 0 : { increment: 1 }, updatedAt: endpoint.updatedAt },
      });
  });
}
export async function enqueueWebhookDelivery(queue: Pick<Queue, "add" | "getJob">, deliveryId: string) {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (
    !delivery ||
    !["PENDING", "RETRYING"].includes(delivery.status) ||
    (delivery.leaseExpiresAt && delivery.leaseExpiresAt > new Date())
  )
    return;
  const jobId = `webhook-${delivery.id}-${delivery.attempts}`;
  const existing = await queue.getJob(jobId);
  if (existing) {
    const status = await existing.getState();
    if (!["completed", "failed"].includes(status)) return;
    await existing.remove();
  }
  await queue.add(
    "webhook-deliver",
    { deliveryId },
    {
      jobId,
      delay: Math.max(0, (delivery.nextRetryAt?.getTime() ?? 0) - Date.now()),
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    },
  );
}
export async function dispatchPendingDeliveries(queue: Pick<Queue, "add" | "getJob">) {
  const now = new Date();
  const deliveries = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "RETRYING"] },
      AND: [
        { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
        { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  for (const delivery of deliveries) await enqueueWebhookDelivery(queue, delivery.id);
}
