import { loadEnvConfig } from "@next/env";
import { Worker } from "bullmq";
import { z } from "zod";

loadEnvConfig(process.cwd());
const jobSchema = z.object({ deliveryId: z.string().min(1).max(128) }).strict();
async function main() {
  const [
    { getWebhookQueue, getQueueConnection },
    { prisma },
    { deliverWebhook, enqueueWebhookDelivery, dispatchPendingDeliveries },
  ] = await Promise.all([import("../queue"), import("../prisma"), import("./dispatcher")]);
  const queue = getWebhookQueue();
  const worker = new Worker(
    "webhook-deliver",
    async (job) => {
      const { deliveryId } = jobSchema.parse(job.data);
      await deliverWebhook(deliveryId);
      await enqueueWebhookDelivery(queue, deliveryId);
    },
    { connection: getQueueConnection(), concurrency: 4 },
  );
  worker.on("error", () => console.error("Webhook worker connection error."));
  worker.on("failed", (job) => console.error("Webhook queue job failed", job?.id));
  queue.on("error", () => console.error("Webhook queue connection error."));
  let running = false;
  let stopped = false;
  let pending: Promise<void> | null = null;
  const dispatch = () => {
    if (running || stopped) return Promise.resolve();
    running = true;
    pending = dispatchPendingDeliveries(queue)
      .catch(() => console.error("Webhook dispatch unavailable; persisted deliveries will be retried."))
      .finally(() => {
        running = false;
      });
    return pending;
  };
  const interval = setInterval(() => void dispatch(), 15000);
  await dispatch();
  const shutdown = async () => {
    stopped = true;
    clearInterval(interval);
    if (pending) await pending;
    await worker.close();
    await queue.close();
    await getQueueConnection().quit();
    await prisma.$disconnect();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.info("Webhook worker started (webhook-deliver)");
}
main().catch(() => {
  console.error("Webhook worker failed to start.");
  process.exitCode = 1;
});
