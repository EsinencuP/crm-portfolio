import { createRequire, Module } from "node:module";

// These server modules run outside Next.js in Node tests. Keep normal React
// exports for next/navigation, and bypass only the server-only poison pill.
const testRequire = createRequire(import.meta.url);
function stubModule(specifier, exports) {
  const filename = testRequire.resolve(specifier);
  const module = new Module(filename);
  module.exports = exports;
  module.loaded = true;
  testRequire.cache[filename] = module;
}

stubModule("server-only", {});
const unexpected = () => {
  throw new Error("Unexpected database access in integration test");
};
const db = { $transaction: unexpected, $queryRaw: unexpected };
for (const name of [
  "phoneCall",
  "workspaceMember",
  "notification",
  "contact",
  "deal",
  "recordPermission",
  "auditLog",
  "messagingChannel",
  "messagingConversation",
  "messagingMessage",
  "leadCaptureForm",
  "formSubmission",
  "tag",
  "pipelineStage",
  "workspace",
  "workflow",
  "workflowStep",
  "workflowRun",
  "activity",
  "emailMessage",
  "emailAccount",
  "webhook",
  "webhookDelivery",
]) {
  db[name] = Object.fromEntries(
    [
      "findFirst",
      "findUnique",
      "findUniqueOrThrow",
      "findMany",
      "count",
      "create",
      "createMany",
      "upsert",
      "update",
      "updateMany",
      "delete",
      "deleteMany",
    ].map((method) => [method, unexpected]),
  );
}
// Prisma delegates are dynamic proxies and cannot be mocked with mock.method.
// Inject plain delegates before importing any route, guaranteeing no database IO.
stubModule("../src/lib/prisma.ts", { __esModule: true, prisma: db, default: db });
stubModule("../src/lib/auth-utils.ts", {
  __esModule: true,
  getCurrentUser: async () => globalThis.telephonyTestActor ?? null,
  requireAuth: async () => globalThis.telephonyTestActor,
});
