import { loadEnvConfig } from "@next/env";
import { Worker } from "bullmq";

loadEnvConfig(process.cwd());

async function main() {
  const [
    { getWorkflowQueue, getQueueConnection },
    { prisma },
    { processWorkflowJob },
    { dispatchWorkflowRuns, dispatchScheduledWorkflows, enqueueWorkflowRun },
  ] = await Promise.all([import("../queue"), import("../prisma"), import("./runner"), import("./dispatch")]);
  const queue = getWorkflowQueue();
  const worker = new Worker(
    "workflow-execute",
    async (job) => {
      await processWorkflowJob(job.data);
      await enqueueWorkflowRun(queue, job.data.runId);
    },
    { connection: getQueueConnection(), concurrency: 4 },
  );
  worker.on("error", () => console.error("Workflow worker connection error."));
  worker.on("failed", (job) => console.error("Workflow queue job failed", job?.id));
  queue.on("error", () => console.error("Workflow queue connection error."));
  let dispatching = false;
  let stopped = false;
  const dispatch = async () => {
    if (dispatching || stopped) return;
    dispatching = true;
    try {
      await dispatchScheduledWorkflows();
      await dispatchWorkflowRuns(queue);
    } catch {
      console.error("Workflow dispatch unavailable; persisted runs will be retried.");
    } finally {
      dispatching = false;
    }
  };
  const interval = setInterval(() => void dispatch(), 15000);
  await dispatch();
  const shutdown = async () => {
    stopped = true;
    clearInterval(interval);
    await worker.close();
    await queue.close();
    await getQueueConnection().quit();
    await prisma.$disconnect();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.info("Workflow worker started (workflow-execute)");
}
main().catch(() => {
  console.error("Workflow worker failed to start.");
  process.exitCode = 1;
});
