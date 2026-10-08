import { POST as createContact } from "../src/app/api/contacts/route.ts";
import { GET as deliveriesHistory } from "../src/app/api/webhooks-config/[id]/deliveries/route.ts";
import { DELETE as deleteHook, GET as getHook, PATCH as patchHook } from "../src/app/api/webhooks-config/[id]/route.ts";
import { POST as testHook } from "../src/app/api/webhooks-config/[id]/test/route.ts";
import { POST as createHook, GET as listHooks } from "../src/app/api/webhooks-config/route.ts";
import { prisma } from "../src/lib/prisma.ts";
import { customHeadersSchema } from "../src/lib/webhooks/config.ts";
import {
  createWebhookDelivery,
  deliverWebhook,
  dispatchPendingDeliveries,
  dispatchWebhooks,
  enqueueWebhookDelivery,
  retryAt,
} from "../src/lib/webhooks/dispatcher.ts";
import {
  outboundWebhookUrl,
  sealWebhookHeaders,
  sealWebhookSecret,
  unsealWebhookHeaders,
  unsealWebhookSecret,
} from "../src/lib/webhooks/security.ts";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

let state;
let member;
const context = { params: Promise.resolve({ id: "webhook-1" }) };
const signingSecret = "fixture-signing-secret-at-least-16-characters";
const json = (body) =>
  new Request("https://crm.test/api/webhooks-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const requestId = "6049f519-0372-4945-a6cd-83d51b45cb31";
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => matches(row, item));
    if (key === "OR") return value.some((item) => matches(row, item));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("has" in value) return row[key].includes(value.has);
      if ("lt" in value) return row[key] != null && row[key] < value.lt;
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
    }
    return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
  });
}
function project(row, select) {
  return select
    ? Object.fromEntries(
        Object.keys(select)
          .filter((key) => select[key])
          .map((key) => [key, row[key]]),
      )
    : row;
}
function apply(row, data) {
  for (const [key, value] of Object.entries(data))
    row[key] = value && typeof value === "object" && "increment" in value ? (row[key] ?? 0) + value.increment : value;
  return row;
}
function defaults(input) {
  return {
    status: "PENDING",
    attempts: 0,
    nextRetryAt: null,
    leaseToken: null,
    leaseExpiresAt: null,
    responseCode: null,
    responseBody: null,
    duration: null,
    error: null,
    createdAt: new Date(),
    ...input,
  };
}
async function start() {
  const ids = await dispatchWebhooks(
    "contact.created",
    { id: "contact-1", firstName: "Ada" },
    "workspace-1",
    undefined,
    "event-1",
  );
  return state.deliveries.find((row) => row.id === ids[0]);
}
beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1" };
  process.env.WEBHOOK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
  delete process.env.WEBHOOK_ALLOWED_HOSTS;
  member = { id: "member-1", userId: "user-1", workspaceId: "workspace-1", role: "OWNER" };
  state = {
    endpoint: {
      id: "webhook-1",
      name: "CRM integration",
      url: "https://receiver.example.com/crm",
      events: ["contact.created", "contact.deleted"],
      secret: sealWebhookSecret(signingSecret),
      headers: sealWebhookHeaders({ "X-Api-Key": "fixture-api-key" }),
      isActive: true,
      deletedAt: null,
      workspaceId: "workspace-1",
      failCount: 0,
      lastTriggeredAt: null,
      createdAt: new Date(),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    },
    deliveries: [],
    audits: [],
    contact: {
      id: "contact-1",
      workspaceId: "workspace-1",
      ownerId: "user-1",
      firstName: "Ada",
      lastName: "Lovelace",
      updatedAt: new Date(),
    },
  };
  mock.method(prisma, "$transaction", async (callback) => {
    const snapshot = structuredClone(state);
    try {
      return await callback(prisma);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  });
  mock.method(prisma, "$queryRaw", async () => []);
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma.webhook, "findMany", async ({ where, select }) =>
    matches(state.endpoint, where) ? [project(state.endpoint, select)] : [],
  );
  mock.method(prisma.webhook, "findFirst", async ({ where, select }) =>
    matches(state.endpoint, where) ? project(state.endpoint, select) : null,
  );
  mock.method(prisma.webhook, "findUnique", async ({ where, select }) =>
    matches(state.endpoint, where) ? project(state.endpoint, select) : null,
  );
  mock.method(prisma.webhook, "count", async ({ where }) => (matches(state.endpoint, where) ? 1 : 0));
  mock.method(prisma.webhook, "create", async ({ data, select }) => {
    state.endpoint = { ...state.endpoint, ...data };
    return project(state.endpoint, select);
  });
  mock.method(prisma.webhook, "update", async ({ where, data, select }) => {
    if (!matches(state.endpoint, where)) throw Object.assign(new Error("Stale"), { code: "P2025" });
    return project(apply(state.endpoint, data), select);
  });
  mock.method(prisma.webhookDelivery, "createMany", async ({ data }) => {
    let count = 0;
    for (const input of data) {
      if (state.deliveries.some((row) => row.webhookId === input.webhookId && row.eventKey === input.eventKey))
        continue;
      state.deliveries.push(defaults(input));
      count++;
    }
    return { count };
  });
  mock.method(prisma.webhookDelivery, "findUniqueOrThrow", async ({ where }) => {
    const key = where.webhookId_eventKey;
    return state.deliveries.find((row) => row.webhookId === key.webhookId && row.eventKey === key.eventKey);
  });
  mock.method(
    prisma.webhookDelivery,
    "findUnique",
    async ({ where }) => state.deliveries.find((row) => matches(row, where)) ?? null,
  );
  mock.method(prisma.webhookDelivery, "findFirst", async ({ where, include }) => {
    const row = state.deliveries.find((row) => matches(row, where));
    return row ? { ...row, ...(include?.webhook ? { webhook: state.endpoint } : {}) } : null;
  });
  mock.method(prisma.webhookDelivery, "findMany", async ({ where, select, skip = 0, take = 25 }) =>
    state.deliveries
      .filter((row) => matches(row, where))
      .slice(skip, skip + take)
      .map((row) => project(row, select)),
  );
  mock.method(
    prisma.webhookDelivery,
    "count",
    async ({ where }) => state.deliveries.filter((row) => matches(row, where)).length,
  );
  mock.method(prisma.webhookDelivery, "update", async ({ where, data }) => {
    const row = state.deliveries.find((row) => matches(row, where));
    if (!row) throw new Error("Delivery mismatch");
    return { ...apply(row, data) };
  });
  mock.method(prisma.webhookDelivery, "updateMany", async ({ where, data }) => {
    const rows = state.deliveries.filter((row) => matches(row, where));
    for (const row of rows) apply(row, data);
    return { count: rows.length };
  });
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    state.audits.push(data);
    return data;
  });
  mock.method(prisma.workflow, "findMany", async () => []);
  mock.method(prisma.contact, "create", async ({ data }) => {
    state.contact = { ...state.contact, ...data };
    return state.contact;
  });
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
  delete process.env.WEBHOOK_TOKEN_ENCRYPTION_KEY;
  delete process.env.WEBHOOK_ALLOWED_HOSTS;
});

test("webhooks: dispatch is tenant/event scoped, replay-safe and immutable through endpoint edits", async () => {
  const row = await start();
  await start();
  assert.equal(state.deliveries.length, 1);
  await dispatchWebhooks("contact.created", {}, "other-workspace");
  await dispatchWebhooks("deal.created", {}, "workspace-1");
  assert.equal(state.deliveries.length, 1);
  state.endpoint.url = "https://different.example.com/crm";
  state.endpoint.secret = sealWebhookSecret("new-fixture-signing-secret");
  assert.equal(row.endpointUrl, "https://receiver.example.com/crm");
  assert.equal(unsealWebhookSecret(row.signingSecret), signingSecret);
  assert.equal(JSON.parse(row.payloadText).event, "contact.created");
});
test("webhooks: HMAC signs exact raw bytes; 2xx updates status, duration and metadata once", async () => {
  const row = await start();
  let calls = 0;
  await deliverWebhook(row.id, async (url, raw, headers) => {
    calls++;
    assert.equal(url, row.endpointUrl);
    assert.equal(raw, row.payloadText);
    assert.equal(
      headers["X-Webhook-Signature"],
      `sha256=${createHmac("sha256", signingSecret).update(raw).digest("hex")}`,
    );
    assert.equal(headers["Idempotency-Key"], row.id);
    assert.equal(headers["X-Api-Key"], "fixture-api-key");
    return { status: 204, body: "", duration: 42 };
  });
  await deliverWebhook(row.id, async () => {
    calls++;
    throw new Error("Should not retry success");
  });
  assert.equal(calls, 1);
  assert.equal(state.deliveries[0].status, "SUCCESS");
  assert.equal(state.deliveries[0].attempts, 1);
  assert.equal(state.deliveries[0].duration, 42);
  assert.equal(state.endpoint.failCount, 0);
  assert.ok(state.endpoint.lastTriggeredAt);
});
test("webhooks: HTTP failures retry at 1, 5, 30 minutes and stop after four attempts", async () => {
  const row = await start();
  const delays = [60000, 300000, 1800000];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const before = Date.now();
    await deliverWebhook(row.id, async () => ({ status: 500, body: "Failure", duration: 12 }));
    const saved = state.deliveries[0];
    assert.equal(saved.attempts, attempt);
    if (attempt < 4) {
      assert.equal(saved.status, "RETRYING");
      assert.ok(saved.nextRetryAt.getTime() - before >= delays[attempt - 1]);
      saved.nextRetryAt = new Date(Date.now() - 1);
    } else {
      assert.equal(saved.status, "FAILED");
      assert.equal(saved.nextRetryAt, null);
    }
  }
  assert.equal(state.endpoint.failCount, 4);
  assert.equal(retryAt(4), null);
});
test("webhooks: network/429/redirect failures retry; successful retry resets failure count", async () => {
  const row = await start();
  await deliverWebhook(row.id, async () => {
    throw new Error("timeout");
  });
  assert.equal(state.deliveries[0].status, "RETRYING");
  assert.equal(state.deliveries[0].responseCode, null);
  for (const code of [429, 302]) {
    state.deliveries[0].nextRetryAt = new Date(Date.now() - 1);
    await deliverWebhook(row.id, async () => ({ status: code, body: "Retry", duration: 1 }));
    assert.equal(state.deliveries[0].responseCode, code);
  }
  state.deliveries[0].nextRetryAt = new Date(Date.now() - 1);
  await deliverWebhook(row.id, async () => ({ status: 200, body: "ok", duration: 2 }));
  assert.equal(state.deliveries[0].status, "SUCCESS");
  assert.equal(state.endpoint.failCount, 0);
});
test("webhooks: leases prevent parallel delivery and interrupted sends recover with backoff", async () => {
  const row = await start();
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: 200, body: "ok", duration: 1 };
  };
  await Promise.all([deliverWebhook(row.id, send), deliverWebhook(row.id, send)]);
  assert.equal(calls, 1);
  const id = await createWebhookDelivery(state.endpoint, "webhook.test", {}, "crash-1", true);
  const interrupted = state.deliveries.find((row) => row.id === id);
  interrupted.attempts = 1;
  await deliverWebhook(id, send);
  assert.equal(calls, 1);
  assert.equal(interrupted.status, "RETRYING");
  assert.ok(interrupted.nextRetryAt.getTime() > Date.now());
});
test("webhooks: paused/deleted subscriptions stop automatic sends but paused test calls remain explicit", async () => {
  const row = await start();
  state.endpoint.isActive = false;
  let calls = 0;
  const send = async () => {
    calls++;
    return { status: 200, body: "ok", duration: 1 };
  };
  await deliverWebhook(row.id, send);
  assert.equal(calls, 0);
  assert.equal(state.deliveries[0].status, "FAILED");
  const id = await createWebhookDelivery(state.endpoint, "webhook.test", {}, "test-paused", true);
  await deliverWebhook(id, send);
  assert.equal(calls, 1);
  const next = await createWebhookDelivery(state.endpoint, "webhook.test", {}, "test-deleted", true);
  state.endpoint.deletedAt = new Date();
  await deliverWebhook(next, send);
  assert.equal(calls, 1);
});
test("webhooks: encrypted credentials/headers resist tampering and are redacted from stored responses", async () => {
  assert.notEqual(state.endpoint.secret, signingSecret);
  assert.equal(unsealWebhookHeaders(state.endpoint.headers)["X-Api-Key"], "fixture-api-key");
  const encrypted = state.endpoint.secret;
  assert.throws(() => unsealWebhookSecret(`${encrypted.slice(0, -3)}xyz`));
  const row = await start();
  await deliverWebhook(row.id, async () => ({
    status: 200,
    body: `Echo ${signingSecret} fixture-api-key ${"x".repeat(3000)}`,
    duration: 1,
  }));
  assert.ok(!state.deliveries[0].responseBody.includes(signingSecret));
  assert.ok(!state.deliveries[0].responseBody.includes("fixture-api-key"));
  assert.ok(state.deliveries[0].responseBody.length <= 2000);
});
test("webhooks: endpoint/header policy rejects SSRF/control overrides and allows a restricted HTTPS host", () => {
  for (const url of [
    "http://receiver.example.com",
    "https://127.0.0.1/",
    "https://169.254.169.254/",
    "https://secret@receiver.example.com/",
    "https://receiver.example.com:8443/",
    "https://localhost/",
  ])
    assert.throws(() => outboundWebhookUrl(url));
  for (const headers of [
    { Host: "internal" },
    { "X-Webhook-Signature": "forged" },
    { Authorization: "bad\r\nHost: internal" },
    { "X-Key": "a", "x-key": "b" },
  ])
    assert.equal(customHeadersSchema.safeParse(headers).success, false);
  process.env.WEBHOOK_ALLOWED_HOSTS = "receiver.example.com";
  assert.equal(outboundWebhookUrl(state.endpoint.url).hostname, "receiver.example.com");
  assert.throws(() => outboundWebhookUrl("https://other.example.com/"));
});
test("webhooks: configuration requires admin; GET/history never return encrypted or plaintext credentials", async () => {
  globalThis.telephonyTestActor = null;
  assert.equal((await listHooks(json({}))).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "MANAGER";
  assert.equal((await listHooks(json({}))).status, 403);
  member.role = "OWNER";
  const body = await (await listHooks(json({}))).json();
  assert.equal(body.webhooks[0].secret, undefined);
  assert.equal(body.webhooks[0].headers, undefined);
  const row = await start();
  const history = await (
    await deliveriesHistory(new Request("https://crm.test/api/webhooks-config/webhook-1/deliveries"), context)
  ).json();
  assert.equal(history.deliveries[0].signingSecret, undefined);
  assert.equal(history.deliveries[0].requestHeaders, undefined);
  assert.equal(history.deliveries[0].id, row.id);
  state.endpoint.workspaceId = "other-workspace";
  assert.equal((await getHook(json({}), context)).status, 404);
  assert.equal((await testHook(json({ requestId }), context)).status, 404);
});
test("webhooks: create/rotate return a signing secret once and audit never stores it", async () => {
  const response = await createHook(
    json({
      name: "New hook",
      url: state.endpoint.url,
      events: ["contact.created"],
      headers: { Authorization: "Bearer fixture" },
    }),
  );
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.signingSecret.length, 64);
  assert.equal(body.webhook.secret, undefined);
  assert.equal(unsealWebhookSecret(state.endpoint.secret), body.signingSecret);
  assert.ok(!JSON.stringify(state.audits).includes(body.signingSecret));
  const rotated = await patchHook(
    json({ rotateSecret: true, updatedAt: state.endpoint.updatedAt.toISOString() }),
    context,
  );
  assert.equal(rotated.status, 200);
  const changed = await rotated.json();
  assert.notEqual(changed.signingSecret, body.signingSecret);
  assert.ok(!JSON.stringify(state.audits).includes(changed.signingSecret));
  assert.equal((await patchHook(json({ isActive: false, updatedAt: "2026-09-01T00:00:00Z" }), context)).status, 409);
});
test("webhooks: test is queued/idempotent, scoped delivery filters prevent foreign reads, delete cancels pending retries", async () => {
  assert.equal((await testHook(json({ requestId }), context)).status, 202);
  assert.equal((await testHook(json({ requestId }), context)).status, 202);
  assert.equal(state.deliveries.length, 1);
  assert.equal(state.deliveries[0].isTest, true);
  const response = await deliveriesHistory(
    new Request("https://crm.test/api/webhooks-config/webhook-1/deliveries?deliveryId=foreign-id"),
    context,
  );
  assert.equal((await response.json()).deliveries.length, 0);
  assert.equal((await deleteHook(json({}), context)).status, 204);
  assert.equal(state.endpoint.isActive, false);
  assert.ok(state.endpoint.deletedAt);
  assert.equal(state.deliveries[0].status, "FAILED");
});
test("webhooks: CRM write and event ledger roll back together if dispatch persistence fails", async () => {
  mock.method(prisma.webhookDelivery, "createMany", async () => {
    throw new Error("Database unavailable");
  });
  const response = await createContact(json({ firstName: "Grace", lastName: "Hopper", email: "grace@example.test" }));
  assert.equal(response.status, 500);
  assert.equal(state.contact.firstName, "Ada");
  assert.equal(state.deliveries.length, 0);
});
test("webhooks: persisted retries become delayed jobs and terminal/active queue jobs are handled safely", async () => {
  const row = await start();
  state.deliveries[0].status = "RETRYING";
  state.deliveries[0].nextRetryAt = new Date(Date.now() + 60000);
  let removed = 0;
  const jobs = [];
  const queue = {
    getJob: async () => ({
      getState: async () => "completed",
      remove: async () => {
        removed++;
      },
    }),
    add: async (...args) => jobs.push(args),
  };
  await enqueueWebhookDelivery(queue, row.id);
  assert.equal(removed, 1);
  assert.ok(jobs[0][2].delay > 59000);
  queue.getJob = async () => ({
    getState: async () => "active",
    remove: async () => {
      removed++;
    },
  });
  await enqueueWebhookDelivery(queue, row.id);
  assert.equal(jobs.length, 1);
  state.deliveries[0].nextRetryAt = new Date(Date.now() - 1);
  queue.getJob = async () => null;
  await dispatchPendingDeliveries(queue);
  assert.equal(jobs.length, 2);
});
