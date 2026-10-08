import { Queue } from "bullmq";
import IORedis from "ioredis";

let redis: IORedis | null = null;
function redisConnection() {
  if (!redis)
    redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  return redis;
}

let queue: Queue | null = null;
export function getEmailSyncQueue() {
  if (!queue) queue = new Queue("email-sync", { connection: redisConnection() });
  return queue;
}

export { redisConnection as getQueueConnection };

let workflowQueue: Queue | null = null;
export function getWorkflowQueue() {
  if (!workflowQueue) workflowQueue = new Queue("workflow-execute", { connection: redisConnection() });
  return workflowQueue;
}

let webhookQueue: Queue | null = null;
export function getWebhookQueue() {
  if (!webhookQueue) webhookQueue = new Queue("webhook-deliver", { connection: redisConnection() });
  return webhookQueue;
}

// Named exports for standalone workers and producers.
export const connection = redisConnection();
export const emailSyncQueue = getEmailSyncQueue();
