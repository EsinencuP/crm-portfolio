import { loadEnvConfig } from "@next/env";
import { Worker } from "bullmq";

loadEnvConfig(process.cwd());

async function main() {
  const [{ getEmailSyncQueue, getQueueConnection }, { prisma }, { syncGmailMessages, syncOutlookMessages }] =
    await Promise.all([import("../queue"), import("../prisma"), import("./sync")]);
  const queue = getEmailSyncQueue();
  const worker = new Worker(
    "email-sync",
    async () => {
      const accounts = await prisma.emailAccount.findMany({
        where: { syncEnabled: true },
        select: { id: true, provider: true },
      });
      for (const account of accounts) {
        try {
          if (account.provider === "GMAIL") await syncGmailMessages(account.id);
          if (account.provider === "OUTLOOK") await syncOutlookMessages(account.id);
        } catch (error) {
          console.error(
            `Email sync failed for account ${account.id}`,
            error instanceof Error ? error.message : "Unknown error",
          );
        }
      }
    },
    { connection: getQueueConnection(), concurrency: 1 },
  );
  await queue.upsertJobScheduler("email-sync-every-5-minutes", { every: 300_000 }, { name: "sync-all", data: {} });
  await queue.add("sync-startup", {}, { jobId: `startup-${Date.now()}`, removeOnComplete: true });
  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.info("Email sync worker started");
}

main().catch((error) => {
  console.error("Email sync worker failed to start", error);
  process.exitCode = 1;
});
