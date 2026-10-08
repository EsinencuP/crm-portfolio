import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";

import { GET as history, POST as pay } from "../src/app/api/invoices/[id]/payments/route.ts";
import { GET as pdf } from "../src/app/api/invoices/[id]/pdf/route.ts";
import { GET as get, PATCH as patch, DELETE as remove } from "../src/app/api/invoices/[id]/route.ts";
import { POST as send } from "../src/app/api/invoices/[id]/send/route.ts";
import { POST as preview } from "../src/app/api/invoices/preview/route.ts";
import { POST as create, GET as list } from "../src/app/api/invoices/route.ts";
import { applyInvoicePayment, effectiveInvoiceStatus, invoiceBalance } from "../src/lib/invoices/money.ts";
import { invoiceTransport } from "../src/lib/invoices/send.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createInvoiceSchema, recordPaymentSchema } from "../src/lib/validations/invoice.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

let state, member;
const context = (id) => ({ params: Promise.resolve({ id }) });
const read = (path) => new Request(`https://crm.test${path}`);
const request = (body, method = "POST") =>
  new Request("https://crm.test/api/invoices", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const input = () => ({
  requestId: randomUUID(),
  contactId: "contact-1",
  issueDate: "2025-01-01",
  dueDate: "2099-01-01",
  currency: "USD",
  lineItems: [{ description: "Консультация", quantity: "3", unitPrice: "0.10", discount: "0", taxRate: "0" }],
  notes: "Тест",
  terms: "Условия",
});
const receipt = (invoice, amount = "0.10", extra = {}) => ({
  amount,
  method: "BANK_TRANSFER",
  requestId: randomUUID(),
  updatedAt: invoice.updatedAt,
  ...extra,
});
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => matches(row, item));
    if (key === "OR") return value.some((item) => matches(row, item));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value instanceof Prisma.Decimal || row[key] instanceof Prisma.Decimal)
      return row[key]?.toString() === String(value);
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("contains" in value) return row[key]?.toLowerCase().includes(value.contains.toLowerCase());
      if ("lt" in value) return row[key] != null && row[key] < value.lt;
      if ("gte" in value) return row[key] != null && row[key] >= value.gte;
    }
    return row[key] === value;
  });
}
function project(row, select) {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(select).map(([key, value]) => [
      key,
      key === "lineItems" ? row.lineItems.map((line) => project(line, value.select)) : row[key],
    ]),
  );
}
function invoiceData(data) {
  const row = {
    id: `invoice-${state.invoices.length + 1}`,
    status: "DRAFT",
    sendState: "IDLE",
    amountPaid: 0,
    quotationId: null,
    dueDate: null,
    sentAt: null,
    deletedAt: null,
    contactId: null,
    companyId: null,
    dealId: null,
    notes: null,
    terms: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    ...data,
  };
  for (const key of ["grandTotal", "subtotal", "taxTotal", "discountTotal", "amountPaid"])
    row[key] = new Prisma.Decimal(row[key]);
  row.lineItems = (data.lineItems.create ?? []).map((line, index) => ({
    ...line,
    id: `${row.id}-line-${index}`,
    productId: line.productId ?? null,
    ...Object.fromEntries(
      ["quantity", "unitPrice", "discount", "taxRate", "total"].map((key) => [key, new Prisma.Decimal(line[key])]),
    ),
  }));
  return row;
}
beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1" };
  member = {
    id: "member-1",
    userId: "user-1",
    workspaceId: "ws-1",
    role: "OWNER",
    workspace: { name: "Тестовая компания" },
  };
  state = {
    invoices: [],
    payments: [],
    audits: [],
    notifications: [],
    deliveries: [],
    sequences: new Map(),
    contacts: [
      {
        id: "contact-1",
        workspaceId: "ws-1",
        ownerId: "user-1",
        firstName: "Анна",
        lastName: "Иванова",
        email: "anna@example.test",
        status: "ACTIVE",
        companyId: null,
      },
    ],
    products: [],
    companies: [],
    deals: [],
  };
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma.workspaceMember, "findUnique", async () => member);
  mock.method(prisma.recordPermission, "findMany", async () => []);
  mock.method(prisma.recordPermission, "findUnique", async () => null);
  for (const [delegate, rows] of [
    ["contact", "contacts"],
    ["company", "companies"],
    ["deal", "deals"],
    ["product", "products"],
    ["invoice", "invoices"],
    ["payment", "payments"],
  ]) {
    mock.method(prisma[delegate], "findFirst", async ({ where, select }) =>
      project(
        state[rows].find((row) => matches(row, where)),
        select,
      ),
    );
    mock.method(prisma[delegate], "findMany", async ({ where, select, skip = 0, take = 999 }) =>
      state[rows]
        .filter((row) => matches(row, where))
        .slice(skip, skip + take)
        .map((row) => project(row, select)),
    );
    mock.method(
      prisma[delegate],
      "count",
      async ({ where }) => state[rows].filter((row) => matches(row, where)).length,
    );
  }
  // Serialize transaction callbacks, mirroring the invoice row lock, and roll back all ledgers on failure.
  let tail = Promise.resolve();
  mock.method(prisma, "$transaction", async (callback) => {
    let release;
    const previous = tail;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    const snapshot = {
      ...state,
      invoices: state.invoices.map((row) => ({ ...row, lineItems: row.lineItems.map((line) => ({ ...line })) })),
      payments: [...state.payments],
      audits: [...state.audits],
      notifications: [...state.notifications],
      deliveries: [...state.deliveries],
      sequences: new Map(state.sequences),
    };
    try {
      return await callback(prisma);
    } catch (error) {
      state = snapshot;
      throw error;
    } finally {
      release();
    }
  });
  mock.method(prisma, "$queryRaw", async () => []);
  mock.method(prisma.documentSequence, "upsert", async ({ where, create, update }) => {
    const key = JSON.stringify(where);
    const counter = state.sequences.has(key) ? state.sequences.get(key) + update.counter.increment : create.counter;
    state.sequences.set(key, counter);
    return { counter };
  });
  mock.method(prisma.invoice, "create", async ({ data, select }) => {
    const row = invoiceData(data);
    state.invoices.push(row);
    return project(row, select);
  });
  mock.method(prisma.invoice, "update", async ({ where, data, select }) => {
    const row = state.invoices.find((item) => matches(item, where));
    if (!row) throw Object.assign(new Error("Stale"), { code: "P2025" });
    const { lineItems, ...fields } = data;
    Object.assign(row, fields, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    if (lineItems) row.lineItems = invoiceData({ ...row, lineItems }).lineItems;
    for (const key of ["grandTotal", "subtotal", "taxTotal", "discountTotal", "amountPaid"])
      row[key] = new Prisma.Decimal(row[key]);
    return project(row, select);
  });
  mock.method(prisma.invoice, "updateMany", async ({ where, data }) => {
    const rows = state.invoices.filter((row) => matches(row, where));
    rows.forEach((row) => {
      Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    });
    return { count: rows.length };
  });
  mock.method(prisma.payment, "findUnique", async ({ where, select }) =>
    project(
      state.payments.find((row) => matches(row, where.invoiceId_requestId)),
      select,
    ),
  );
  mock.method(prisma.payment, "create", async ({ data, select }) => {
    const row = {
      id: `payment-${state.payments.length + 1}`,
      createdAt: new Date(),
      status: "COMPLETED",
      ...data,
      amount: new Prisma.Decimal(data.amount),
    };
    state.payments.push(row);
    return project(row, select);
  });
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    state.audits.push(data);
    return data;
  });
  mock.method(prisma.notification, "create", async ({ data }) => {
    state.notifications.push(data);
    return data;
  });
  mock.method(prisma.webhook, "findMany", async ({ where }) => {
    assert.deepEqual(where, {
      workspaceId: member.workspaceId,
      isActive: true,
      deletedAt: null,
      events: { has: "invoice.paid" },
    });
    return [
      {
        id: "endpoint-1",
        workspaceId: member.workspaceId,
        url: "https://example.test/receipt",
        secret: "sealed",
        headers: null,
      },
    ];
  });
  mock.method(prisma.webhookDelivery, "createMany", async ({ data }) => {
    state.deliveries.push(...data);
    return { count: data.length };
  });
  mock.method(prisma.emailAccount, "findFirst", async ({ where }) =>
    where.id === "account-1" && where.userId === member.userId && where.workspaceId === member.workspaceId
      ? { id: "account-1" }
      : null,
  );
  mock.method(invoiceTransport, "renderDocumentPdf", async () => new TextEncoder().encode("%PDF-fixture"));
  mock.method(invoiceTransport, "sendEmail", async () => ({ id: "email-1", sentAt: new Date() }));
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
});
async function created(body = input()) {
  const response = await create(request(body));
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
async function recorded(invoice, amount = "0.10", extra = {}) {
  const response = await pay(request(receipt(invoice, amount, extra)), context(invoice.id));
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
const edited = (invoice) => ({
  contactId: invoice.contactId,
  issueDate: invoice.issueDate.slice(0, 10),
  dueDate: invoice.dueDate?.slice(0, 10) ?? null,
  currency: invoice.currency,
  updatedAt: invoice.updatedAt,
  lineItems: invoice.lineItems.map(({ id: _, position: __, total: ___, ...line }) => line),
});

test("invoices: strict schemas reject spoofed totals/status, invalid dates, precision and future payments", () => {
  assert.equal(createInvoiceSchema.safeParse(input()).success, true);
  for (const fields of [
    { amountPaid: "5" },
    { status: "PAID" },
    { dueDate: "2020-01-01" },
    { contactId: null },
    { expiryDate: "2099-01-01" },
  ])
    assert.equal(createInvoiceSchema.safeParse({ ...input(), ...fields }).success, false);
  const body = receipt({ updatedAt: new Date().toISOString() });
  for (const fields of [
    { amount: "0" },
    { amount: "-1" },
    { amount: "0.001" },
    { amount: "10000000000" },
    { status: "COMPLETED" },
    { workspaceId: "other" },
    { paidAt: "2099-01-01" },
    { method: "UNKNOWN" },
    { requestId: "bad" },
  ])
    assert.equal(recordPaymentSchema.safeParse({ ...body, ...fields }).success, false);
  assert.equal(recordPaymentSchema.parse({ ...body, amount: 0.1 }).amount, "0.1");
});
test("invoices: exact cents, outstanding balance and overdue derivation", () => {
  assert.deepEqual(applyInvoicePayment("0.30", "0.10", "0.20"), {
    amountPaid: "0.30",
    balance: "0.00",
    status: "PAID",
    fullyPaid: true,
  });
  assert.equal(invoiceBalance({ grandTotal: "9000000000.10", amountPaid: "0.10" }), "9000000000.00");
  assert.throws(() => applyInvoicePayment("0.30", "0.20", "0.11"), /exceeds/);
  const row = { grandTotal: "10", amountPaid: "1", dueDate: "2020-01-01", status: "PARTIALLY_PAID" };
  assert.equal(effectiveInvoiceStatus(row), "OVERDUE");
  assert.equal(effectiveInvoiceStatus({ ...row, status: "DRAFT" }), "DRAFT");
  assert.equal(effectiveInvoiceStatus({ ...row, status: "PAID", amountPaid: "10" }), "PAID");
});
test("invoices: standalone creation uses workspace/year numbering and content idempotency", async () => {
  const body = input(),
    invoice = await created(body);
  assert.equal(invoice.number, "INV-2025-0001");
  assert.equal(invoice.amountPaid, "0");
  assert.equal(invoice.sendState, "IDLE");
  assert.equal(invoice.grandTotal, "0.3");
  const replay = await create(request(body));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).id, invoice.id);
  assert.equal(state.audits.length, 1);
  assert.equal((await create(request({ ...body, notes: "changed" }))).status, 409);
  assert.equal((await created()).number, "INV-2025-0002");
});
test("invoices: draft edit computes totals, stale edit fails, delete archives and reserves number", async () => {
  const invoice = await created(),
    body = edited(invoice);
  body.lineItems[0].quantity = "4";
  const response = await patch(request(body, "PATCH"), context(invoice.id));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.grandTotal, "0.4");
  assert.equal((await patch(request(body, "PATCH"), context(invoice.id))).status, 409);
  assert.equal((await remove(request({ updatedAt: saved.updatedAt }, "DELETE"), context(invoice.id))).status, 204);
  assert.ok(state.invoices[0].deletedAt);
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 404);
});
test("invoices: partial then full payment atomically saves two audits, notification and one webhook", async () => {
  const invoice = await created(),
    partial = await recorded(invoice, "0.10", { reference: "wire-1", paidAt: "2025-02-01" });
  assert.equal(partial.invoice.amountPaid, "0.1");
  assert.equal(partial.invoice.status, "PARTIALLY_PAID");
  assert.equal(state.notifications[0].type, "PAYMENT_RECEIVED");
  assert.equal(state.deliveries.length, 0);
  const full = await recorded(partial.invoice, "0.20", { method: "CASH" });
  assert.equal(full.invoice.status, "PAID");
  assert.equal(invoiceBalance(full.invoice), "0.00");
  assert.equal(state.payments.length, 2);
  assert.equal(state.audits.length, 5);
  assert.equal(state.notifications[1].type, "INVOICE_PAID");
  assert.equal(state.deliveries.length, 1);
  const delivery = state.deliveries[0];
  assert.equal(delivery.event, "invoice.paid");
  assert.equal(delivery.status, "PENDING");
  assert.equal(delivery.payload.data.amountPaid, "0.3");
  assert.equal("clientEmail" in delivery.payload.data, false);
  const lock = prisma.$queryRaw.mock.calls[0].arguments;
  assert.equal(lock[1], invoice.id);
  assert.equal(lock[2], "ws-1");
  assert.match(lock[0].join(""), /FOR UPDATE/);
});
test("invoices: replayed payment with old version never duplicates receipt or paid webhook", async () => {
  const invoice = await created(),
    body = receipt(invoice, "0.30"),
    first = await pay(request(body), context(invoice.id));
  assert.equal(first.status, 201);
  const replay = await pay(request(body), context(invoice.id));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  assert.equal(state.payments.length, 1);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.deliveries.length, 1);
  assert.equal(state.audits.length, 3);
  assert.equal((await pay(request({ ...body, amount: "0.10" }), context(invoice.id))).status, 409);
});
test("invoices: reject wrong currency, overpayment and duplicate transaction reference", async () => {
  const invoice = await created();
  assert.equal((await pay(request(receipt(invoice, "0.31")), context(invoice.id))).status, 400);
  assert.equal((await pay(request(receipt(invoice, "0.10", { currency: "EUR" })), context(invoice.id))).status, 400);
  assert.equal(state.payments.length, 0);
  const partial = await recorded(invoice, "0.10", { reference: "wire-1" });
  assert.equal(
    (await pay(request(receipt(partial.invoice, "0.10", { reference: "wire-1" })), context(invoice.id))).status,
    409,
  );
  assert.equal(state.payments.length, 1);
  await recorded(partial.invoice, "0.10");
  assert.equal(state.payments.length, 2);
});
test("invoices: simultaneous stale payments cannot lose updates; refresh needed for second receipt", async () => {
  const invoice = await created(),
    results = await Promise.all([
      pay(request(receipt(invoice, "0.20")), context(invoice.id)),
      pay(request(receipt(invoice, "0.20")), context(invoice.id)),
    ]);
  assert.deepEqual(results.map((row) => row.status).sort(), [201, 409]);
  assert.equal(state.payments.length, 1);
  assert.equal(state.invoices[0].amountPaid.toString(), "0.2");
  const current = await (await get(read("/api/invoices"), context(invoice.id))).json();
  assert.equal((await pay(request(receipt(current, "0.20")), context(invoice.id))).status, 400);
});
test("invoices: notification failure rolls back receipt, totals and audits", async () => {
  const invoice = await created();
  mock.method(prisma.notification, "create", async () => {
    throw new Error("Failure");
  });
  assert.equal((await pay(request(receipt(invoice, "0.10")), context(invoice.id))).status, 500);
  assert.equal(state.payments.length, 0);
  assert.equal(state.invoices[0].amountPaid.toString(), "0");
  assert.equal(state.audits.length, 1);
  assert.equal(state.deliveries.length, 0);
});
test("invoices: failed webhook persistence rolls back a fully paid transition", async () => {
  const invoice = await created();
  mock.method(prisma.webhookDelivery, "createMany", async () => {
    throw new Error("Failure");
  });
  assert.equal((await pay(request(receipt(invoice, "0.30")), context(invoice.id))).status, 500);
  assert.equal(state.payments.length, 0);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.invoices[0].status, "DRAFT");
  assert.equal(state.audits.length, 1);
});
test("invoices: viewers read scoped history but cannot write; anonymous users cannot read", async () => {
  const invoice = await created();
  member.role = "VIEWER";
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 200);
  assert.equal((await history(read("/api/invoices"), context(invoice.id))).status, 200);
  for (const route of [create, pay, send])
    assert.equal((await route(request(receipt(invoice)), context(invoice.id))).status, 403);
  assert.equal((await patch(request(edited(invoice), "PATCH"), context(invoice.id))).status, 403);
  assert.equal((await remove(request({ updatedAt: invoice.updatedAt }, "DELETE"), context(invoice.id))).status, 403);
  delete globalThis.telephonyTestActor;
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 401);
});
test("invoices: foreign workspace, other owner and revoked client ACL do not expose documents/payments", async () => {
  const invoice = await created();
  member.workspaceId = "ws-2";
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 404);
  assert.equal((await history(read("/api/invoices"), context(invoice.id))).status, 404);
  assert.equal((await pay(request(receipt(invoice)), context(invoice.id))).status, 404);
  member.workspaceId = "ws-1";
  member.role = "MEMBER";
  state.invoices[0].ownerId = "user-2";
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 404);
  member.role = "VIEWER";
  state.invoices[0].ownerId = "user-1";
  mock.method(prisma.recordPermission, "findMany", async () => [{ entityId: "contact-1", permission: "NONE" }]);
  assert.equal((await get(read("/api/invoices"), context(invoice.id))).status, 404);
});
test("invoices: history pagination and DTO omit private deduplication and workspace fields", async () => {
  const invoice = await created();
  await recorded(invoice, "0.10");
  const response = await history(read("/api/invoices/x/payments"), context(invoice.id)),
    body = await response.json();
  assert.equal(body.total, 1);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  for (const key of ["requestDigest", "requestId", "workspaceId", "recordedById"])
    assert.equal(key in body.payments[0], false);
  assert.equal((await history(read("/api/invoices/x/payments?page=0"), context(invoice.id))).status, 400);
});
test("invoices: paid/partially paid bills immutable, payment totals/status cannot be patched", async () => {
  const invoice = await created(),
    partial = await recorded(invoice);
  assert.equal((await patch(request(edited(partial.invoice), "PATCH"), context(invoice.id))).status, 409);
  assert.equal(
    (await remove(request({ updatedAt: partial.invoice.updatedAt }, "DELETE"), context(invoice.id))).status,
    409,
  );
  assert.equal(
    (await patch(request({ updatedAt: partial.invoice.updatedAt, status: "CANCELLED" }, "PATCH"), context(invoice.id)))
      .status,
    409,
  );
  for (const fields of [{ status: "PAID" }, { amountPaid: "0.30" }])
    assert.equal(
      (await patch(request({ updatedAt: partial.invoice.updatedAt, ...fields }, "PATCH"), context(invoice.id))).status,
      400,
    );
});
test("invoices: cancellation preserves history and refuses payment/email send", async () => {
  const invoice = await created(),
    response = await patch(
      request({ updatedAt: invoice.updatedAt, status: "CANCELLED" }, "PATCH"),
      context(invoice.id),
    );
  assert.equal(response.status, 200);
  const cancelled = await response.json();
  assert.equal((await pay(request(receipt(cancelled)), context(invoice.id))).status, 409);
  assert.equal(
    (await send(request({ updatedAt: cancelled.updatedAt, accountId: "account-1" }), context(invoice.id))).status,
    409,
  );
});
test("invoices: sends real attachment contract, preserves paid status and does not resend", async () => {
  const invoice = await created(),
    partial = await recorded(invoice),
    body = { updatedAt: partial.invoice.updatedAt, accountId: "account-1" },
    response = await send(request(body), context(invoice.id));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "PARTIALLY_PAID");
  const sent = invoiceTransport.sendEmail.mock.calls[0].arguments[0];
  assert.equal(sent.to[0], "anna@example.test");
  assert.equal(sent.attachments[0].contentType, "application/pdf");
  assert.match(sent.bodyHtml, /Balance: 0.20/);
  assert.equal(invoiceTransport.renderDocumentPdf.mock.calls[0].arguments[1], "Invoice");
  assert.equal((await send(request(body), context(invoice.id))).status, 200);
  assert.equal(invoiceTransport.sendEmail.mock.calls.length, 1);
  const full = await recorded(await (await get(read("/api/invoices"), context(invoice.id))).json(), "0.20");
  assert.equal(full.invoice.status, "PAID");
  assert.equal(state.deliveries.length, 1);
});
test("invoices: full payment before initial email remains paid after sending", async () => {
  const invoice = await created(),
    full = await recorded(invoice, "0.30"),
    response = await send(request({ updatedAt: full.invoice.updatedAt, accountId: "account-1" }), context(invoice.id));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "PAID");
  assert.equal(state.deliveries.length, 1);
});
test("invoices: unknown send cannot retry, sending blocks payment, uncertain state still accepts receipts", async () => {
  const invoice = await created();
  mock.method(invoiceTransport, "sendEmail", async () => {
    throw new Error("Timeout");
  });
  assert.equal(
    (await send(request({ updatedAt: invoice.updatedAt, accountId: "account-1" }), context(invoice.id))).status,
    502,
  );
  const uncertain = await (await get(read("/api/invoices"), context(invoice.id))).json();
  assert.equal(uncertain.sendState, "UNCERTAIN");
  assert.equal(
    (await send(request({ updatedAt: uncertain.updatedAt, accountId: "account-1" }), context(invoice.id))).status,
    409,
  );
  await recorded(uncertain);
  state.invoices[0].sendState = "SENDING";
  const current = await (await get(read("/api/invoices"), context(invoice.id))).json();
  assert.equal((await pay(request(receipt(current)), context(invoice.id))).status, 409);
});
test("invoices: real PDF preview/download are authenticated, privately cached and contain valid embedded-font PDF", async () => {
  const invoice = await created(),
    response = await pdf(read("/api/invoices/x/pdf?download=1"), context(invoice.id));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Disposition"), /^attachment/);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const document = await PDFDocument.load(await response.arrayBuffer());
  assert.equal(document.getTitle(), `Invoice ${invoice.number}`);
  assert.ok(document.getPageCount() >= 1);
  const { requestId: _, ...body } = input(),
    draft = await preview(request(body));
  assert.equal(draft.status, 200);
  assert.equal(draft.headers.get("Content-Type"), "application/pdf");
  assert.equal(state.invoices.length, 1);
  member.workspaceId = "ws-2";
  assert.equal((await pdf(read("/api/invoices/x/pdf"), context(invoice.id))).status, 404);
});
test("invoices: list search and overdue filtering align with displayed invoice status", async () => {
  await created();
  state.invoices[0].status = "PARTIALLY_PAID";
  state.invoices[0].dueDate = new Date("2020-01-01");
  const overdue = await (await list(read("/api/invoices?status=OVERDUE"))).json();
  assert.equal(overdue.total, 1);
  assert.equal((await (await list(read("/api/invoices?status=PARTIALLY_PAID"))).json()).total, 0);
  assert.equal((await (await list(read("/api/invoices?search=Иванова"))).json()).total, 1);
  assert.equal((await list(read("/api/invoices?page=0"))).status, 400);
});
