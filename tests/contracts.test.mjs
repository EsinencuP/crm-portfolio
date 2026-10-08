import { GET as get, PATCH as patch, DELETE as remove } from "../src/app/api/contracts/[id]/route.ts";
import { POST as create, GET as list } from "../src/app/api/contracts/route.ts";
import { prisma } from "../src/lib/prisma.ts";
import { contractFields, contractStateSchema, nextContractState } from "../src/lib/validations/contract.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

let state, member;
const context = (id) => ({ params: Promise.resolve({ id }) });
const request = (body, method = "POST") =>
  new Request("https://crm.test/api/contracts", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const read = (q = "") => new Request(`https://crm.test/api/contracts?${q}`);
const input = () => ({
  title: "Договор услуг",
  content: "## Условия\n**Оплата**",
  currency: "USD",
  value: "123.45",
  contactId: "contact-1",
  requestId: randomUUID(),
});
function matches(row, where = {}) {
  return Object.entries(where).every(([k, v]) => {
    if (k === "AND") return v.every((w) => matches(row, w));
    if (k === "OR") return v.some((w) => matches(row, w));
    if (v instanceof Date) return row[k]?.getTime() === v.getTime();
    if (v && typeof v === "object") {
      if ("in" in v) return v.in.includes(row[k]);
      if ("not" in v) return row[k] !== v.not;
      if ("contains" in v) return row[k]?.toLowerCase().includes(v.contains.toLowerCase());
    }
    return row[k] === v;
  });
}
function project(row, select) {
  if (!row) return null;
  const nested = {
    contact: state.contacts.find((c) => c.id === row.contactId) ?? null,
    company: state.companies.find((c) => c.id === row.companyId) ?? null,
    deal: state.deals.find((d) => d.id === row.dealId) ?? null,
  };
  return Object.fromEntries(
    Object.entries(select ?? row)
      .filter(([, v]) => v !== false)
      .map(([k, v]) => [k, v?.select ? project(nested[k], v.select) : row[k]]),
  );
}
beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1" };
  member = { userId: "user-1", workspaceId: "ws-1", role: "OWNER", workspace: { name: "Test" } };
  state = {
    rows: [],
    audits: [],
    sequence: 0,
    contacts: [
      {
        id: "contact-1",
        workspaceId: "ws-1",
        ownerId: "user-1",
        firstName: "Анна",
        lastName: "Иванова",
        companyId: "company-1",
        status: "ACTIVE",
      },
    ],
    companies: [{ id: "company-1", workspaceId: "ws-1", name: "Client" }],
    deals: [
      {
        id: "deal-1",
        workspaceId: "ws-1",
        ownerId: "user-1",
        title: "Consulting",
        contactId: "contact-1",
        companyId: "company-1",
      },
    ],
  };
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma.workspaceMember, "findUnique", async () => member);
  mock.method(prisma.recordPermission, "findMany", async () => []);
  mock.method(prisma.recordPermission, "findUnique", async () => null);
  for (const [delegate, rows] of [
    ["contact", "contacts"],
    ["company", "companies"],
    ["deal", "deals"],
  ]) {
    mock.method(prisma[delegate], "findMany", async ({ where, select }) =>
      state[rows].filter((r) => matches(r, where)).map((r) => project(r, select)),
    );
    mock.method(prisma[delegate], "findFirst", async ({ where, select }) =>
      project(
        state[rows].find((r) => matches(r, where)),
        select,
      ),
    );
  }
  mock.method(prisma, "$transaction", async (fn) => {
    const snapshot = structuredClone(state);
    try {
      return await fn(prisma);
    } catch (e) {
      state = snapshot;
      throw e;
    }
  });
  mock.method(prisma.documentSequence, "upsert", async () => ({ counter: ++state.sequence }));
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    state.audits.push(data);
    return data;
  });
  mock.method(prisma.contract, "create", async ({ data, select }) => {
    const row = {
      id: `contract-${state.rows.length + 1}`,
      status: "DRAFT",
      signedByClient: false,
      signedByUs: false,
      deletedAt: null,
      contactId: null,
      companyId: null,
      dealId: null,
      value: null,
      documentUrl: null,
      content: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    state.rows.push(row);
    return project(row, select);
  });
  mock.method(prisma.contract, "findFirst", async ({ where, select }) =>
    project(
      state.rows.find((r) => matches(r, where)),
      select,
    ),
  );
  mock.method(prisma.contract, "findMany", async ({ where, select, skip = 0, take = 20 }) =>
    state.rows
      .filter((r) => matches(r, where))
      .slice(skip, skip + take)
      .map((r) => project(r, select)),
  );
  mock.method(prisma.contract, "count", async ({ where }) => state.rows.filter((r) => matches(r, where)).length);
  mock.method(prisma.contract, "update", async ({ where, data, select }) => {
    const row = state.rows.find((r) => matches(r, where));
    if (!row) throw Object.assign(new Error("stale"), { code: "P2025" });
    Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    return project(row, select);
  });
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
});
async function saved(fields = {}) {
  const response = await create(request({ ...input(), ...fields }));
  assert.equal(response.status, 201);
  return response.json();
}
async function changed(row, fields) {
  const response = await patch(request({ ...fields, updatedAt: row.updatedAt }, "PATCH"), context(row.id));
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
test("contract validation rejects spoofed state, unsafe URL, invalid decimal and inverted dates", () => {
  for (const fields of [
    { status: "ACTIVE" },
    { workspaceId: "other" },
    { signedByUs: true },
    { documentUrl: "javascript:alert(1)" },
    { documentUrl: "https://name:password@test.com" },
    { value: "1.234" },
    { startDate: "2026-02-01", endDate: "2026-01-01" },
  ])
    assert.equal(contractFields.safeParse({ title: "Test", currency: "USD", ...fields }).success, false);
  assert.equal(
    contractStateSchema.safeParse({ updatedAt: new Date().toISOString(), status: "SIGNED", signedByUs: true }).success,
    false,
  );
});
test("create, workspace numbering, safe DTO, idempotent retry and digest conflict", async () => {
  const body = input(),
    row = await (await create(request(body))).json();
  assert.match(row.number, /^CTR-\d{4}-0001$/);
  assert.equal(row.ownerId, undefined);
  assert.equal(row.requestDigest, undefined);
  assert.equal(row.canWrite, true);
  assert.equal((await create(request(body))).status, 200);
  assert.equal(state.sequence, 1);
  assert.equal(state.audits.length, 1);
  assert.equal((await create(request({ ...body, title: "Different" }))).status, 409);
});
test("GET list filters, bounded pagination and protected body size", async () => {
  await saved();
  await saved({ title: "Other" });
  const body = await (await list(read("search=Договор&limit=1"))).json();
  assert.equal(body.total, 1);
  assert.equal(body.contracts[0].content, undefined);
  assert.equal((await list(read("limit=1000"))).status, 400);
  assert.equal((await create(request({ ...input(), content: "x".repeat(140000) }))).status, 413);
});
test("draft edits with compare-and-swap, partial invalid bodies and stale versions", async () => {
  const row = await saved(),
    { requestId: _, ...fields } = input();
  const next = await changed(row, { ...fields, title: "Updated", contactId: null });
  assert.equal(next.title, "Updated");
  assert.equal((await patch(request({ ...fields, updatedAt: row.updatedAt }, "PATCH"), context(row.id))).status, 409);
  assert.equal(
    (await patch(request({ currency: "USD", updatedAt: next.updatedAt }, "PATCH"), context(row.id))).status,
    400,
  );
});
test("lifecycle from review to sent, both signatures, active; issued text immutable", async () => {
  let row = await saved();
  row = await changed(row, { status: "PENDING_REVIEW" });
  row = await changed(row, { status: "SENT" });
  assert.equal(
    (await patch(request({ ...input(), requestId: undefined, updatedAt: row.updatedAt }, "PATCH"), context(row.id)))
      .status,
    409,
  );
  assert.equal(
    (await patch(request({ status: "ACTIVE", updatedAt: row.updatedAt }, "PATCH"), context(row.id))).status,
    409,
  );
  row = await changed(row, { signedByClient: true });
  assert.equal(row.status, "SENT");
  row = await changed(row, { signedByUs: true });
  assert.equal(row.status, "SIGNED");
  row = await changed(row, { signedByUs: false });
  assert.equal(row.status, "SENT");
  row = await changed(row, { signedByUs: true });
  row = await changed(row, { status: "ACTIVE" });
  assert.equal(
    (await patch(request({ signedByClient: false, updatedAt: row.updatedAt }, "PATCH"), context(row.id))).status,
    409,
  );
  row = await changed(row, { status: "CANCELLED" });
  assert.equal(
    (await patch(request({ status: "DRAFT", updatedAt: row.updatedAt }, "PATCH"), context(row.id))).status,
    409,
  );
});
test("activation/expiry validates time period and terminal flow", () => {
  const row = {
    status: "SIGNED",
    signedByClient: true,
    signedByUs: true,
    startDate: new Date("2026-12-01"),
    endDate: null,
  };
  assert.throws(() => nextContractState(row, { status: "ACTIVE" }, "2026-10-08"));
  assert.throws(() =>
    nextContractState({ ...row, status: "ACTIVE", startDate: null }, { status: "EXPIRED" }, "2026-10-08"),
  );
  assert.equal(
    nextContractState({ ...row, startDate: null, endDate: new Date("2026-10-07") }, { status: "EXPIRED" }, "2026-10-08")
      .status,
    "EXPIRED",
  );
  assert.throws(() => nextContractState({ ...row, status: "EXPIRED" }, { status: "ACTIVE" }, "2026-10-08"));
});
test("soft-delete draft preserves number; issued delete forbidden", async () => {
  const row = await saved();
  assert.equal((await remove(request({ updatedAt: row.updatedAt }, "DELETE"), context(row.id))).status, 200);
  assert.equal(state.rows[0].number, row.number);
  assert.ok(state.rows[0].deletedAt);
  assert.equal((await get(read(), context(row.id))).status, 404);
  let issued = await saved();
  issued = await changed(issued, { status: "SENT" });
  assert.equal((await remove(request({ updatedAt: issued.updatedAt }, "DELETE"), context(issued.id))).status, 409);
});
test("anonymous, viewer, foreign workspace and non-owner boundaries", async () => {
  const row = await saved();
  globalThis.telephonyTestActor = null;
  assert.equal((await get(read(), context(row.id))).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "VIEWER";
  const viewed = await (await get(read(), context(row.id))).json();
  assert.equal(viewed.canWrite, false);
  assert.equal((await create(request(input()))).status, 403);
  assert.equal(
    (await patch(request({ status: "SENT", updatedAt: row.updatedAt }, "PATCH"), context(row.id))).status,
    403,
  );
  member.workspaceId = "other";
  assert.equal((await get(read(), context(row.id))).status, 404);
  member.workspaceId = "ws-1";
  member.role = "MANAGER";
  member.userId = "user-2";
  assert.equal((await get(read(), context(row.id))).status, 404);
});
test("foreign and inconsistent references rejected, revoked ACL hides document", async () => {
  assert.equal((await create(request({ ...input(), contactId: "foreign" }))).status, 403);
  assert.equal((await create(request({ ...input(), companyId: "company-1", dealId: "deal-1" }))).status, 201);
  state.contacts[0].companyId = "different";
  assert.equal((await create(request({ ...input(), companyId: "company-1" }))).status, 400);
  state.contacts[0].companyId = "company-1";
  const row = await saved();
  member.role = "MANAGER";
  state.contacts[0].ownerId = "other";
  assert.equal((await get(read(), context(row.id))).status, 404);
});
test("audit failure rolls back contract and number allocation", async () => {
  mock.method(prisma.auditLog, "create", async () => {
    throw new Error("audit failure");
  });
  assert.equal((await create(request(input()))).status, 500);
  assert.equal(state.rows.length, 0);
  assert.equal(state.sequence, 0);
});
