import { POST as createContact } from "../src/app/api/contacts/route.ts";
import { PATCH as patchWorkflow, PUT as putWorkflow } from "../src/app/api/workflows/[id]/route.ts";
import { POST as manualRun } from "../src/app/api/workflows/[id]/runs/route.ts";
import { POST as createWorkflow, GET as listWorkflows } from "../src/app/api/workflows/route.ts";
import { canAccess } from "../src/lib/permissions.ts";
import { prisma } from "../src/lib/prisma.ts";
import { entityAccess, workflowWhere } from "../src/lib/workflows/access.ts";
import { executeSendNotification } from "../src/lib/workflows/actions.ts";
import { evaluateTriggerConditions, renderTemplate, workflowSchema } from "../src/lib/workflows/config.ts";
import { dispatchScheduledWorkflows, enqueueWorkflowRun } from "../src/lib/workflows/dispatch.ts";
import { loadEditorDocument, serializeEditorDocument } from "../src/lib/workflows/editor.ts";
import { triggerWorkflows } from "../src/lib/workflows/engine.ts";
import { processWorkflowJob } from "../src/lib/workflows/runner.ts";
import { publicWebhookAddress, webhookUrl } from "../src/lib/workflows/webhook.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

let state;
let member;
const context = { params: Promise.resolve({ id: "workflow-1" }) };
const json = (body) =>
  new Request("https://crm.test/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => matches(row, item));
    if (key === "OR") return value.some((item) => matches(row, item));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("lt" in value) return row[key] != null && row[key] < value.lt;
      if ("lte" in value) return row[key] != null && row[key] <= value.lte;
    }
    return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
  });
}
function apply(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) row[key] = (row[key] ?? 0) + value.increment;
    else if (value && typeof value === "object" && "push" in value) row[key].push(value.push);
    else row[key] = value;
  }
  return row;
}
function setSteps(steps) {
  state.workflow.steps = steps.map((step, position) => ({ ...step, position }));
}
async function start(key = "event-1") {
  const ids = await triggerWorkflows(state.workflow.trigger, "Contact", "contact-1", "workspace-1", {}, undefined, key);
  return state.runs.find((run) => run.id === ids[0]);
}
beforeEach(() => {
  mock.method(prisma.webhook, "findMany", async () => []);
  globalThis.telephonyTestActor = { id: "user-1" };
  process.env.WORKFLOW_WEBHOOK_ALLOWED_HOSTS = "hooks.example.com";
  member = { id: "member-1", userId: "user-1", workspaceId: "workspace-1", role: "OWNER" };
  state = {
    contact: {
      id: "contact-1",
      workspaceId: "workspace-1",
      ownerId: "user-1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      status: "ACTIVE",
      source: "WEBSITE",
      updatedAt: new Date(),
    },
    workflow: {
      ...workflowSchema.parse({
        name: "Website leads",
        trigger: "CONTACT_CREATED",
        triggerConfig: {
          entityType: "Contact",
          conditions: [{ field: "source", operator: "equals", value: "WEBSITE" }],
        },
        steps: [{ type: "CREATE_TASK", config: { title: "Follow up {{firstName}}" } }],
      }),
      id: "workflow-1",
      workspaceId: "workspace-1",
      createdById: "user-1",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      createdAt: new Date(Date.now() - 120000),
      isActive: true,
      deletedAt: null,
      runCount: 0,
    },
    runs: [],
    tasks: [],
    audits: [],
    notifications: [],
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
  mock.method(prisma.workspaceMember, "findUnique", async ({ where }) =>
    where.userId_workspaceId?.workspaceId === member.workspaceId ? member : null,
  );
  mock.method(prisma.workspaceMember, "count", async () => 1);
  mock.method(prisma.contact, "findFirst", async ({ where }) => (matches(state.contact, where) ? state.contact : null));
  mock.method(prisma.contact, "create", async ({ data }) => {
    state.contact = { ...state.contact, ...data };
    return state.contact;
  });
  mock.method(prisma.contact, "update", async ({ data }) => apply(state.contact, data));
  mock.method(prisma.recordPermission, "findUnique", async () => null);
  mock.method(prisma.workflow, "findMany", async ({ where }) =>
    matches(state.workflow, where) ? [state.workflow] : [],
  );
  mock.method(prisma.workflow, "findFirst", async ({ where }) =>
    matches(state.workflow, where) ? state.workflow : null,
  );
  mock.method(prisma.workflow, "count", async () => 1);
  mock.method(prisma.workflow, "update", async ({ where, data }) => {
    if (!matches(state.workflow, where)) throw new Error("Workflow update mismatch");
    return apply(state.workflow, data);
  });
  mock.method(prisma.workflowRun, "createMany", async ({ data }) => {
    let count = 0;
    for (const input of data) {
      if (state.runs.some((run) => run.workflowId === input.workflowId && run.eventKey === input.eventKey)) continue;
      state.runs.push({
        ...input,
        currentStep: 0,
        logs: [],
        resumeAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        externalStartedStep: null,
        startedAt: new Date(),
        completedAt: null,
        error: null,
      });
      count++;
    }
    return { count };
  });
  mock.method(prisma.workflowRun, "findFirst", async ({ where, include }) => {
    const run = state.runs.find((row) => matches(row, where));
    return run ? { ...run, ...(include?.workflow ? { workflow: state.workflow } : {}) } : null;
  });
  mock.method(
    prisma.workflowRun,
    "findUnique",
    async ({ where }) => state.runs.find((row) => matches(row, where)) ?? null,
  );
  mock.method(prisma.workflowRun, "findMany", async ({ where }) => state.runs.filter((row) => matches(row, where)));
  mock.method(prisma.workflowRun, "updateMany", async ({ where, data }) => {
    const rows = state.runs.filter((row) => matches(row, where));
    for (const row of rows) apply(row, data);
    return { count: rows.length };
  });
  mock.method(prisma.workflowRun, "update", async ({ where, data }) => {
    const row = state.runs.find((run) => matches(run, where));
    if (!row) throw new Error("Run update mismatch");
    return apply(row, data);
  });
  mock.method(prisma.activity, "create", async ({ data }) => {
    const task = { id: `task-${state.tasks.length}`, ...data };
    state.tasks.push(task);
    return task;
  });
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    state.audits.push(data);
    return data;
  });
  mock.method(prisma.notification, "create", async ({ data }) => {
    const notification = { id: "notification-1", ...data };
    state.notifications.push(notification);
    return notification;
  });
  mock.method(prisma.tag, "count", async () => 0);
  mock.method(prisma.pipelineStage, "count", async () => 0);
  mock.method(prisma.emailAccount, "count", async () => 1);
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
  delete process.env.WORKFLOW_WEBHOOK_ALLOWED_HOSTS;
});

test("workflow: conditions fail closed and template values are HTML-escaped", () => {
  assert.equal(
    evaluateTriggerConditions(
      { conditions: [{ field: "source", operator: "equals", value: "WEBSITE" }] },
      state.contact,
    ),
    true,
  );
  assert.equal(
    evaluateTriggerConditions({ conditions: [{ field: "unknown", operator: "equals", value: null }] }, {}),
    false,
  );
  assert.equal(
    evaluateTriggerConditions({ conditions: [{ field: "value", operator: "gt", value: "2" }] }, { value: "10" }),
    true,
  );
  assert.equal(
    evaluateTriggerConditions({ conditions: [{ field: "value", operator: "lt", value: 2 }] }, { value: "garbage" }),
    false,
  );
  assert.equal(
    evaluateTriggerConditions({ conditions: [{ field: "status", operator: "not_equals", value: "ACTIVE" }] }, {}),
    false,
  );
  assert.equal(
    renderTemplate("<p>{{firstName}}</p>", { firstName: '<script>"&' }, true),
    "<p>&lt;script&gt;&quot;&amp;</p>",
  );
  assert.throws(() => renderTemplate("{{constructor}}", {}), /Unknown template/);
  assert.equal(
    workflowSchema.safeParse({
      name: "Unsupported",
      trigger: "CONTACT_CREATED",
      steps: [{ type: "SEND_WHATSAPP", config: {} }],
    }).success,
    false,
  );
});
test("workflow: trigger records one immutable run per event and isolates workspaces", async () => {
  const run = await start();
  assert.equal(state.workflow.runCount, 1);
  assert.equal(run.context.firstName, "Ada");
  assert.equal(run.stepsSnapshot[0].type, "CREATE_TASK");
  await start();
  assert.equal(state.runs.length, 1);
  assert.equal(state.workflow.runCount, 1);
  await triggerWorkflows("CONTACT_CREATED", "Contact", "contact-1", "foreign-workspace");
  assert.equal(state.runs.length, 1);
  state.workflow.steps = [];
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].title, "Follow up Ada");
  assert.equal(state.runs[0].status, "COMPLETED");
});
test("workflow: database action, audit and checkpoint are atomic; repeats do not duplicate tasks", async () => {
  const run = await start();
  await processWorkflowJob({ runId: run.id, step: 0 });
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.runs[0].logs.length, 1);
  const next = await start("event-2");
  mock.method(prisma.auditLog, "create", async () => {
    throw new Error("Audit unavailable");
  });
  await processWorkflowJob({ runId: next.id, step: 0 });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.runs[1].currentStep, 0);
  assert.equal(state.runs[1].status, "FAILED");
});
test("workflow: WAIT schedules delayed continuation and resumes at the next step", async () => {
  setSteps([
    { type: "WAIT", config: { duration: 60 } },
    { type: "SEND_NOTIFICATION", config: { title: "Hello {{firstName}}" } },
  ]);
  const run = await start();
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.runs[0].status, "WAITING");
  assert.equal(state.runs[0].currentStep, 1);
  const jobs = [];
  const queue = { getJob: async () => null, add: async (...args) => jobs.push(args) };
  await enqueueWorkflowRun(queue, run.id);
  assert.ok(jobs[0][2].delay > 59000);
  assert.equal(jobs[0][1].step, 1);
  await processWorkflowJob({ runId: run.id, step: 1 });
  assert.equal(state.notifications.length, 0);
  state.runs[0].resumeAt = new Date(Date.now() - 1);
  await processWorkflowJob({ runId: run.id, step: 1 });
  assert.equal(state.notifications[0].title, "Hello Ada");
  assert.equal(state.runs[0].status, "COMPLETED");
});
test("workflow: concurrent deliveries are leased; disabled workflows and false conditions stop", async () => {
  let run = await start();
  await Promise.all([processWorkflowJob({ runId: run.id, step: 0 }), processWorkflowJob({ runId: run.id, step: 0 })]);
  assert.equal(state.tasks.length, 1);
  run = await start("event-2");
  state.workflow.isActive = false;
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.runs[1].status, "CANCELLED");
  state.workflow.isActive = true;
  setSteps([
    { type: "CONDITION", config: { conditions: [{ field: "source", operator: "equals", value: "MANUAL" }] } },
    { type: "CREATE_TASK", config: { title: "Never" } },
  ]);
  run = await start("event-3");
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.runs[2].status, "CANCELLED");
  assert.equal(state.tasks.length, 1);
});
test("workflow: revoked rights and cross-workspace actions fail without mutations", async () => {
  let run = await start();
  member.role = "VIEWER";
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.runs[0].status, "FAILED");
  assert.equal(state.tasks.length, 0);
  member.role = "OWNER";
  setSteps([{ type: "ADD_TAG", config: { tagId: "foreign-tag" } }]);
  run = await start("event-2");
  await processWorkflowJob({ runId: run.id, step: 0 });
  assert.equal(state.runs[1].status, "FAILED");
  assert.equal(state.contact.tags, undefined);
  setSteps([{ type: "UPDATE_FIELD", config: { field: "workspaceId", value: "foreign" } }]);
  await assert.rejects(() => start("event-3"));
});
test("workflow: external actions are never replayed when prior outcome is uncertain", async () => {
  setSteps([{ type: "CALL_WEBHOOK", config: { url: "https://hooks.example.com/crm" } }]);
  const run = await start();
  state.runs[0].externalStartedStep = 0;
  let calls = 0;
  const effects = {
    email: async () => {
      calls++;
      return { messageId: "sent" };
    },
    webhook: async () => {
      calls++;
      return { httpStatus: 200 };
    },
  };
  await processWorkflowJob({ runId: run.id, step: 0 }, effects);
  assert.equal(calls, 0);
  assert.equal(state.runs[0].status, "FAILED");
  assert.match(state.runs[0].error, /uncertain/);
  const next = await start("event-2");
  await processWorkflowJob({ runId: next.id, step: 0 }, effects);
  assert.equal(calls, 1);
  assert.equal(state.runs[1].status, "COMPLETED");
});
test("workflow: webhook policy denies private/reserved addresses, credentials and unlisted hosts", () => {
  for (const value of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.0.1",
    "100.64.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
  ])
    assert.equal(publicWebhookAddress(value), false, value);
  assert.equal(publicWebhookAddress("8.8.8.8"), true);
  assert.equal(publicWebhookAddress("2606:4700:4700::1111"), true);
  for (const value of [
    "http://hooks.example.com",
    "https://localhost/",
    "https://secret@hooks.example.com/",
    "https://hooks.example.com:8443/",
  ])
    assert.throws(() => webhookUrl(value));
  assert.equal(webhookUrl("https://hooks.example.com/crm").hostname, "hooks.example.com");
});
test("workflow: manager cannot administer another creator; anonymous/viewer APIs are rejected", async () => {
  globalThis.telephonyTestActor = null;
  assert.equal((await listWorkflows(json({}))).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "VIEWER";
  assert.equal((await createWorkflow(json({}))).status, 403);
  member.role = "MANAGER";
  assert.equal(workflowWhere(member).createdById, "user-1");
  state.workflow.createdById = "other-admin";
  assert.equal(
    (await patchWorkflow(json({ isActive: false, updatedAt: state.workflow.updatedAt.toISOString() }), context)).status,
    404,
  );
});
test("workflow: scoped background authorization does not depend on selected workspace", async () => {
  member.role = "MANAGER";
  mock.method(prisma.workspaceMember, "findFirst", async () => ({ ...member, workspaceId: "other-active-workspace" }));
  assert.equal(await canAccess("user-1", "Contact", "contact-1", "EDIT", "workspace-1"), true);
  assert.equal(await entityAccess(prisma, member, "Contact", "contact-1"), true);
  state.contact.ownerId = "another-user";
  assert.equal(await entityAccess(prisma, member, "Contact", "contact-1"), false);
});
test("workflow: contact POST records run in the same transaction and rolls back on enqueue-ledger failure", async () => {
  let response = await createContact(
    json({ firstName: "Grace", lastName: "Hopper", email: "grace@example.test", source: "WEBSITE" }),
  );
  assert.equal(response.status, 201);
  assert.equal(state.runs.length, 1);
  mock.method(prisma.workflowRun, "createMany", async () => {
    throw new Error("Database unavailable");
  });
  response = await createContact(
    json({ firstName: "Changed", lastName: "Name", email: "changed@example.test", source: "WEBSITE" }),
  );
  assert.equal(response.status, 500);
  assert.equal(state.contact.firstName, "Grace");
});
test("workflow: manual request IDs and scheduled time buckets are deduplicated", async () => {
  state.workflow.trigger = "MANUAL";
  const input = { entityType: "Contact", entityId: "contact-1", requestId: "6049f519-0372-4945-a6cd-83d51b45cb31" };
  assert.equal((await manualRun(json(input), context)).status, 202);
  assert.equal((await manualRun(json(input), context)).status, 202);
  assert.equal(state.runs.length, 1);
  state.workflow.trigger = "SCHEDULED";
  state.workflow.triggerConfig = { entityType: "Contact", entityId: "contact-1", intervalMinutes: 1 };
  await dispatchScheduledWorkflows();
  await dispatchScheduledWorkflows();
  assert.equal(state.runs.length, 2);
});
test("workflow: stale completed queue records are redriven, active deliveries are retained", async () => {
  const run = await start();
  let added = 0;
  let removed = 0;
  const queue = {
    getJob: async () => ({
      getState: async () => "completed",
      remove: async () => {
        removed++;
      },
    }),
    add: async () => {
      added++;
    },
  };
  await enqueueWorkflowRun(queue, run.id);
  assert.equal(removed, 1);
  assert.equal(added, 1);
  queue.getJob = async () => ({
    getState: async () => "active",
    remove: async () => {
      removed++;
    },
  });
  await enqueueWorkflowRun(queue, run.id);
  assert.equal(removed, 1);
  assert.equal(added, 1);
});

test("workflow: related contact template data is included only after record authorization", async () => {
  setSteps([{ type: "CALL_WEBHOOK", config: { url: "https://hooks.example.com/crm" } }]);
  state.workflow.trigger = "DEAL_CREATED";
  state.workflow.triggerConfig = { entityType: "Deal", conditions: [] };
  const deal = {
    id: "deal-1",
    workspaceId: "workspace-1",
    ownerId: "user-1",
    contactId: "contact-1",
    title: "Website project",
  };
  mock.method(prisma.deal, "findFirst", async () => deal);
  await triggerWorkflows("DEAL_CREATED", "Deal", "deal-1", "workspace-1", {}, undefined, "related-1");
  assert.equal(state.runs[0].context.firstName, "Ada");
  member.role = "MANAGER";
  state.contact.ownerId = "another-user";
  let calls = 0;
  await processWorkflowJob(
    { runId: state.runs[0].id, step: 0 },
    {
      email: async () => ({ messageId: "not-used" }),
      webhook: async () => {
        calls++;
        return { httpStatus: 200 };
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(state.runs[0].status, "FAILED");
  assert.match(state.runs[0].error, /related contact access/);
  await triggerWorkflows("DEAL_CREATED", "Deal", "deal-1", "workspace-1", {}, undefined, "related-2");
  assert.equal(state.runs[1].context.firstName, undefined);
});

test("workflow: notifications cannot expose a related contact to a recipient with only deal access", async () => {
  const deal = { id: "deal-1", workspaceId: "workspace-1", ownerId: "user-1", contactId: "contact-1" };
  mock.method(prisma.deal, "findFirst", async () => deal);
  mock.method(prisma.workspaceMember, "findUnique", async ({ where }) =>
    where.userId_workspaceId.userId === "user-2" ? { ...member, userId: "user-2", role: "MANAGER" } : member,
  );
  mock.method(prisma.recordPermission, "findUnique", async ({ where }) =>
    where.workspaceId_entityType_entityId_userId.entityType === "Deal" ? { permission: "VIEW" } : null,
  );
  await assert.rejects(
    () =>
      executeSendNotification(
        { title: "Lead {{firstName}}", userId: "user-2" },
        {
          db: prisma,
          member,
          entityType: "Deal",
          entityId: "deal-1",
          runId: "run-1",
          step: 0,
          data: { relatedContactId: "contact-1", firstName: "Ada" },
        },
      ),
    /cannot view the related contact/,
  );
  assert.equal(state.notifications.length, 0);
});

test("workflow builder: Yes/No choose only the selected branch and terminal routing skips siblings", async () => {
  for (const matchesSource of [true, false]) {
    setSteps([
      {
        type: "CONDITION",
        nodeId: "condition",
        nextPosition: 1,
        elsePosition: 2,
        config: { conditions: [{ field: "source", operator: "equals", value: matchesSource ? "WEBSITE" : "OTHER" }] },
      },
      { type: "CREATE_TASK", nodeId: "yes", nextPosition: -1, config: { title: "Yes branch" } },
      { type: "CREATE_TASK", nodeId: "no", nextPosition: -1, config: { title: "No branch" } },
    ]);
    const run = await start(`branch-${matchesSource}`);
    await processWorkflowJob({ runId: run.id, step: 0 });
    assert.equal(run.currentStep, matchesSource ? 1 : 2);
    await processWorkflowJob({ runId: run.id, step: run.currentStep });
    assert.equal(state.tasks.at(-1).title, matchesSource ? "Yes branch" : "No branch");
    assert.equal(run.status, "COMPLETED");
  }
  assert.equal(state.tasks.length, 2);
});

test("workflow builder: PUT persists validated canvas routing and rejects foreign managers", async () => {
  const document = loadEditorDocument({ ...state.workflow, canvas: null });
  document.canvas.nodes[1].position = { x: 1000, y: 520 };
  document.canvas.viewport = { x: -10, y: -30, zoom: 0.6 };
  mock.method(prisma.workflow, "update", async ({ where, data }) => {
    assert.ok(matches(state.workflow, where));
    const { steps, ...rest } = data;
    apply(state.workflow, rest);
    state.workflow.steps = steps.create;
    return state.workflow;
  });
  const response = await putWorkflow(
    json({
      updatedAt: state.workflow.updatedAt.toISOString(),
      canvas: document.canvas,
      steps: serializeEditorDocument(document.canvas, document.steps),
    }),
    context,
  );
  assert.equal(response.status, 200);
  const saved = (await response.json()).workflow;
  assert.deepEqual(saved.canvas, document.canvas);
  assert.equal(saved.steps[0].nextPosition, -1);
  member.role = "MANAGER";
  state.workflow.createdById = "someone-else";
  assert.equal(
    (await putWorkflow(json({ updatedAt: state.workflow.updatedAt.toISOString(), name: "Unauthorized" }), context))
      .status,
    404,
  );
});
