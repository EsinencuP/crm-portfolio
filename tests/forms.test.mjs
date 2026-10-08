import { PATCH as patchForm } from "../src/app/api/forms/[id]/route.ts";
import { POST as submitRoute } from "../src/app/api/forms/[id]/submit/route.ts";
import { POST as createForm, GET as listForms } from "../src/app/api/forms/route.ts";
import { defaultFields, fieldsSchema, formConfigSchema, submissionSchema } from "../src/lib/forms/config.ts";
import { SubmissionError, submitLeadForm } from "../src/lib/forms/submit.ts";
import { prisma } from "../src/lib/prisma.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const requestId = "6049f519-0372-4945-a6cd-83d51b45cb31";
const config = formConfigSchema.parse({ name: "Contact us", slug: "contact-us", fields: defaultFields });
const request = () =>
  new Request("https://crm.test/api/forms/contact-us/submit", {
    headers: { "x-forwarded-for": "203.0.113.1", "user-agent": "test" },
  });
const body = (data = {}) => ({ requestId, data: { firstName: "Ada", email: "ADA@example.test", ...data } });
let state;
let member;
let form;
beforeEach(() => {
  mock.method(prisma.workflow, "findMany", async () => []);
  mock.method(prisma.webhook, "findMany", async () => []);
  mock.method(prisma.contact, "findUniqueOrThrow", async () => state.contacts[0]);
  globalThis.telephonyTestActor = { id: "user-1" };
  delete process.env.FORMS_TRUST_PROXY;
  member = { id: "member-1", userId: "user-1", workspaceId: "workspace-1", role: "MANAGER" };
  form = {
    ...config,
    id: "form-1",
    workspaceId: "workspace-1",
    createdById: "user-1",
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date(),
  };
  state = { contacts: [], submissions: [], deals: [], notifications: [], increments: 0, formRate: 0, ipRate: 0 };
  mock.method(prisma, "$transaction", async (callback) => {
    const snapshot = structuredClone(state);
    try {
      return await callback(prisma);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  });
  mock.method(prisma, "$queryRaw", async (_sql, slug) => (slug === form.slug ? [{ id: form.id }] : []));
  mock.method(prisma.leadCaptureForm, "findUniqueOrThrow", async () => form);
  mock.method(prisma.leadCaptureForm, "update", async ({ data }) => {
    if (data.submissionCount) state.increments++;
    return { ...form, ...data };
  });
  mock.method(prisma.formSubmission, "findUnique", async () => state.submissions[0] ?? null);
  mock.method(prisma.formSubmission, "count", async ({ where }) => (where.ipAddress ? state.ipRate : state.formRate));
  mock.method(prisma.formSubmission, "create", async ({ data }) => {
    const value = { id: "submission-1", ...data };
    state.submissions.push(value);
    return value;
  });
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma.workspaceMember, "findMany", async () => [member]);
  mock.method(prisma.workspaceMember, "findUnique", async () => member);
  mock.method(prisma.workspaceMember, "count", async () => 1);
  mock.method(prisma.contact, "findFirst", async ({ where }) => {
    assert.equal(where.workspaceId, "workspace-1");
    return state.contacts[0] ?? null;
  });
  mock.method(prisma.contact, "create", async ({ data }) => {
    const value = { id: "contact-1", ...data };
    state.contacts.push(value);
    return value;
  });
  mock.method(prisma.contact, "update", async ({ data }) => {
    Object.assign(state.contacts[0], data);
    return state.contacts[0];
  });
  mock.method(prisma.recordPermission, "findUnique", async () => null);
  mock.method(prisma.tag, "findMany", async () => [{ id: "tag-1" }]);
  mock.method(prisma.tag, "count", async () => 1);
  mock.method(prisma.pipelineStage, "findFirst", async () => ({ id: "stage-1" }));
  mock.method(prisma.pipelineStage, "count", async () => 1);
  mock.method(prisma.workspace, "findUniqueOrThrow", async () => ({ defaultCurrency: "EUR" }));
  mock.method(prisma.deal, "create", async ({ data }) => {
    state.deals.push(data);
    return data;
  });
  mock.method(prisma.notification, "create", async ({ data }) => {
    state.notifications.push(data);
    return data;
  });
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
  delete process.env.FORMS_TRUST_PROXY;
});

test("forms: dynamic configuration rejects duplicate/reserved names and incorrect mappings", () => {
  assert.equal(fieldsSchema.safeParse([defaultFields[0], defaultFields[0]]).success, false);
  assert.equal(fieldsSchema.safeParse([{ ...defaultFields[0], name: "constructor" }]).success, false);
  assert.equal(fieldsSchema.safeParse([{ ...defaultFields[0], name: "email" }]).success, false);
  assert.equal(formConfigSchema.safeParse({ ...config, redirectUrl: "javascript:alert(1)" }).success, false);
  const fields = fieldsSchema.parse([
    { name: "choice", label: "Choice", type: "select", required: true, options: ["One"] },
    { name: "consent", label: "Consent", type: "checkbox", required: true },
  ]);
  assert.equal(submissionSchema(fields).safeParse({ choice: "Other", consent: true }).success, false);
  assert.equal(submissionSchema(fields).safeParse({ choice: "One", consent: false }).success, false);
  assert.equal(submissionSchema(fields).safeParse({ choice: "One", consent: true, hidden: "bad" }).success, false);
  assert.equal(submissionSchema(fields).safeParse({ choice: "One", consent: true }).success, true);
});
test("forms: public submit atomically creates scoped contact, tags, deal and notification", async () => {
  globalThis.telephonyTestActor = null;
  form.tagIds = ["tag-1"];
  form.pipelineStageId = "stage-1";
  const result = await submitLeadForm(form.slug, body(), request());
  assert.equal(result.message, config.thankyouMessage);
  assert.equal(result.contactId, undefined);
  assert.equal(state.contacts[0].email, "ada@example.test");
  assert.equal(state.contacts[0].lastName, "Lead");
  assert.equal(state.contacts[0].source, "WEBSITE");
  assert.equal(state.contacts[0].ownerId, "user-1");
  assert.equal(state.contacts[0].workspaceId, "workspace-1");
  assert.deepEqual(state.contacts[0].tags.connect, [{ id: "tag-1" }]);
  assert.equal(state.deals[0].currency, "EUR");
  assert.equal(state.submissions[0].processed, true);
  assert.equal(state.submissions[0].ipAddress, null);
  assert.equal(state.notifications[0].type, "FORM_SUBMISSION");
  assert.equal(state.increments, 1);
});
test("forms: replay is successful without duplicate contact/deal/notification/count", async () => {
  await submitLeadForm(form.slug, body(), request());
  await submitLeadForm(form.slug, body(), request());
  assert.equal(state.contacts.length, 1);
  assert.equal(state.submissions.length, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.increments, 1);
});
test("forms: duplicate email preserves existing contact and respects record ACL", async () => {
  state.contacts.push({ id: "existing", ownerId: "other-user", firstName: "Original", email: "ada@example.test" });
  form.tagIds = ["tag-1"];
  form.pipelineStageId = "stage-1";
  await submitLeadForm(form.slug, body(), request());
  assert.equal(state.contacts.length, 1);
  assert.equal(state.contacts[0].ownerId, "other-user");
  assert.equal(state.contacts[0].firstName, "Original");
  assert.equal(state.deals.length, 0);
  assert.equal(state.contacts[0].tags, undefined);
  assert.equal(state.submissions[0].contactId, "existing");
});
test("forms: invalid input, inactive forms and honeypots do not write", async () => {
  await assert.rejects(
    () => submitLeadForm(form.slug, body({ email: "invalid" }), request()),
    (error) => error instanceof SubmissionError && error.status === 400,
  );
  assert.equal(state.contacts.length, 0);
  await submitLeadForm(form.slug, { ...body(), website: "bot" }, request());
  assert.equal(state.submissions.length, 0);
  form.isActive = false;
  await assert.rejects(
    () => submitLeadForm(form.slug, body(), request()),
    (error) => error.status === 404,
  );
});
test("forms: notification failure rolls back contact, deal, submission and counter", async () => {
  form.pipelineStageId = "stage-1";
  mock.method(prisma.notification, "create", async () => {
    throw new Error("Notification unavailable");
  });
  await assert.rejects(() => submitLeadForm(form.slug, body(), request()), /Notification unavailable/);
  assert.equal(state.contacts.length, 0);
  assert.equal(state.submissions.length, 0);
  assert.equal(state.deals.length, 0);
  assert.equal(state.increments, 0);
});
test("forms: trusted-IP rate limit and global form rate return 429 without writes", async () => {
  process.env.FORMS_TRUST_PROXY = "true";
  state.ipRate = 5;
  await assert.rejects(
    () => submitLeadForm(form.slug, body(), request()),
    (error) => error.status === 429,
  );
  delete process.env.FORMS_TRUST_PROXY;
  state.ipRate = 0;
  state.formRate = 60;
  await assert.rejects(
    () => submitLeadForm(form.slug, body(), request()),
    (error) => error.status === 429,
  );
  assert.equal(state.contacts.length, 0);
});
test("forms: missing owner prevents partial processing; member notification links to contact", async () => {
  member.role = "VIEWER";
  mock.method(prisma.workspaceMember, "findMany", async () => []);
  await assert.rejects(
    () => submitLeadForm(form.slug, body(), request()),
    (error) => error.status === 503,
  );
  assert.equal(state.contacts.length, 0);
  member.role = "MEMBER";
  mock.method(prisma.workspaceMember, "findMany", async () => [member]);
  await submitLeadForm(form.slug, body(), request());
  assert.equal(state.notifications[0].link, "/dashboard/contacts/contact-1");
});
test("forms: management endpoints require manager role and isolate workspaces", async () => {
  globalThis.telephonyTestActor = null;
  assert.equal((await listForms(request())).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "MEMBER";
  assert.equal((await listForms(request())).status, 403);
  member.role = "MANAGER";
  mock.method(prisma.leadCaptureForm, "findMany", async ({ where }) => {
    assert.equal(where.workspaceId, "workspace-1");
    return [];
  });
  mock.method(prisma.leadCaptureForm, "count", async () => 0);
  assert.equal((await listForms(request())).status, 200);
  mock.method(prisma.workspaceMember, "count", async () => 0);
  const invalidOwner = new Request("https://crm.test/api/forms", {
    method: "POST",
    body: JSON.stringify({ ...config, assignToId: "foreign-user" }),
  });
  assert.equal((await createForm(invalidOwner)).status, 400);
});
test("forms: public route accepts no session and refuses oversize JSON", async () => {
  globalThis.telephonyTestActor = null;
  const context = { params: Promise.resolve({ id: form.slug }) };
  const oversized = new Request(request().url, {
    method: "POST",
    body: JSON.stringify({ ...body(), pad: "x".repeat(66000) }),
  });
  assert.equal((await submitRoute(oversized, context)).status, 400);
  const response = await submitRoute(
    new Request(request().url, { method: "POST", body: JSON.stringify(body()) }),
    context,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).contactId, undefined);
});
test("forms: stale editor versions return conflict instead of overwriting", async () => {
  mock.method(prisma.leadCaptureForm, "update", async ({ where }) => {
    assert.equal(where.workspaceId, "workspace-1");
    assert.equal(where.updatedAt.toISOString(), "2026-09-01T00:00:00.000Z");
    throw Object.assign(new Error("Stale"), { code: "P2025" });
  });
  const response = await patchForm(
    new Request("https://crm.test/api/forms/form-1", {
      method: "PATCH",
      body: JSON.stringify({ isActive: false, updatedAt: "2026-09-01T00:00:00.000Z" }),
    }),
    { params: Promise.resolve({ id: "form-1" }) },
  );
  assert.equal(response.status, 409);
});
