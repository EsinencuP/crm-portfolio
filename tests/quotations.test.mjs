import { Prisma } from "@prisma/client";
import { PDFDocument } from "pdf-lib";

import { POST as convert } from "../src/app/api/quotations/[id]/convert/route.ts";
import { GET as pdfRoute } from "../src/app/api/quotations/[id]/pdf/route.ts";
import { GET as get, PATCH as patch, DELETE as remove } from "../src/app/api/quotations/[id]/route.ts";
import { POST as send } from "../src/app/api/quotations/[id]/send/route.ts";
import { GET as options } from "../src/app/api/quotations/options/route.ts";
import { POST as preview } from "../src/app/api/quotations/preview/route.ts";
import { POST as create, GET as list } from "../src/app/api/quotations/route.ts";
import { generateContractNumber, generateInvoiceNumber, generateQuotationNumber } from "../src/lib/document-numbers.ts";
import { emailMimeContent, graphPdfAttachments } from "../src/lib/email/attachments.ts";
import { prisma } from "../src/lib/prisma.ts";
import { renderDocumentPdf } from "../src/lib/quotations/pdf.ts";
import { quotationTransport } from "../src/lib/quotations/send.ts";
import { calculateQuotation } from "../src/lib/quotations/totals.ts";
import { createQuotationSchema } from "../src/lib/validations/quotation.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, mock, test } from "node:test";

let state, member;
const context = (id) => ({ params: Promise.resolve({ id }) });
const request = (body, method = "POST") =>
  new Request("https://crm.test/api/quotations", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const read = (path) => new Request(`https://crm.test${path}`);
const input = () => ({
  requestId: randomUUID(),
  contactId: "contact-1",
  issueDate: "2026-10-08",
  expiryDate: "2099-10-08",
  currency: "USD",
  lineItems: [
    {
      productId: "product-1",
      description: "Консультация",
      quantity: "3",
      unitPrice: "0.10",
      discount: "10",
      taxRate: "20",
    },
  ],
  notes: "Тестовое КП",
  terms: "Оплата после согласования",
});
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "AND") return value.every((item) => matches(row, item));
    if (key === "OR") return value.some((item) => matches(row, item));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("contains" in value)
        return typeof row[key] === "string" && row[key].toLowerCase().includes(value.contains.toLowerCase());
      if ("lt" in value) return row[key] != null && row[key] < value.lt;
      if ("gte" in value) return row[key] != null && row[key] >= value.gte;
    }
    return row[key] === value;
  });
}
function project(row, select) {
  if (!row) return row;
  if (!select) return { ...row };
  return Object.fromEntries(
    Object.entries(select).map(([key, value]) => {
      if (key === "invoices")
        return [
          key,
          state.invoices
            .filter((invoice) => invoice.quotationId === row.id)
            .map((item) => ({ id: item.id, number: item.number })),
        ];
      if (key === "lineItems") return [key, row.lineItems.map((item) => project(item, value.select))];
      return [key, row[key]];
    }),
  );
}
function documentData(data, type) {
  const now = new Date(),
    base = {
      id: `${type}-${state[type === "quote" ? "quotes" : "invoices"].length + 1}`,
      status: "DRAFT",
      sendState: "IDLE",
      sentAt: null,
      emailMessageId: null,
      deletedAt: null,
      expiryDate: null,
      dueDate: null,
      quotationId: null,
      amountPaid: new Prisma.Decimal(0),
      contactId: null,
      companyId: null,
      dealId: null,
      notes: null,
      terms: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
  for (const field of ["subtotal", "taxTotal", "discountTotal", "grandTotal"])
    base[field] = new Prisma.Decimal(base[field]);
  base.lineItems = (data.lineItems.create ?? []).map((line, index) => ({
    ...line,
    id: `${base.id}-line-${index}`,
    productId: line.productId ?? null,
    ...Object.fromEntries(
      ["quantity", "unitPrice", "discount", "taxRate", "total"].map((field) => [
        field,
        new Prisma.Decimal(line[field]),
      ]),
    ),
  }));
  return base;
}
beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1" };
  member = {
    id: "membership-1",
    userId: "user-1",
    workspaceId: "ws-1",
    role: "OWNER",
    workspace: { name: "Тестовая компания", defaultCurrency: "USD" },
  };
  state = {
    quotes: [],
    invoices: [],
    audits: [],
    sequences: new Map(),
    contacts: [
      {
        id: "contact-1",
        workspaceId: "ws-1",
        ownerId: "user-1",
        firstName: "Анна",
        lastName: "Иванова",
        email: "anna@example.test",
        companyId: "company-1",
        status: "ACTIVE",
      },
    ],
    companies: [{ id: "company-1", workspaceId: "ws-1", name: "Клиент" }],
    deals: [{ id: "deal-1", workspaceId: "ws-1", ownerId: "user-1", contactId: "contact-1", companyId: "company-1" }],
    products: [{ id: "product-1", workspaceId: "ws-1", isActive: true, deletedAt: null, currency: "USD" }],
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
  ]) {
    mock.method(prisma[delegate], "findMany", async ({ where, select, take }) =>
      state[rows]
        .filter((row) => matches(row, where))
        .slice(0, take ?? 999)
        .map((row) => project(row, select)),
    );
    mock.method(
      prisma[delegate],
      "findFirst",
      async ({ where, select }) =>
        project(
          state[rows].find((row) => matches(row, where)),
          select,
        ) ?? null,
    );
  }
  mock.method(prisma.emailAccount, "findFirst", async ({ where }) =>
    where.id === "account-1" ? { id: "account-1" } : null,
  );
  mock.method(prisma, "$transaction", async (callback) => {
    const snapshot = {
      ...state,
      quotes: structuredCloneRows(state.quotes),
      invoices: structuredCloneRows(state.invoices),
      audits: [...state.audits],
      sequences: new Map(state.sequences),
    };
    try {
      return await callback(prisma);
    } catch (error) {
      state = snapshot;
      throw error;
    }
  });
  mock.method(prisma.auditLog, "create", async ({ data }) => {
    state.audits.push(data);
    return data;
  });
  mock.method(prisma.documentSequence, "upsert", async ({ where, create, update }) => {
    const { workspaceId, kind, year } = where.workspaceId_kind_year,
      key = `${workspaceId}:${kind}:${year}`,
      counter = state.sequences.has(key) ? state.sequences.get(key) + update.counter.increment : create.counter;
    state.sequences.set(key, counter);
    return { counter };
  });
  mock.method(
    prisma.quotation,
    "findFirst",
    async ({ where, select }) =>
      project(
        state.quotes.find((row) => matches(row, where)),
        select,
      ) ?? null,
  );
  mock.method(prisma.quotation, "findMany", async ({ where, select, skip = 0, take = 20 }) =>
    state.quotes
      .filter((row) => matches(row, where))
      .slice(skip, skip + take)
      .map((row) => project(row, select)),
  );
  mock.method(prisma.quotation, "count", async ({ where }) => state.quotes.filter((row) => matches(row, where)).length);
  mock.method(prisma.quotation, "create", async ({ data, select }) => {
    if (state.quotes.some((row) => row.workspaceId === data.workspaceId && row.requestId === data.requestId))
      throw Object.assign(new Error("Duplicate"), { code: "P2002" });
    const row = documentData(data, "quote");
    state.quotes.push(row);
    return project(row, select);
  });
  mock.method(prisma.quotation, "update", async ({ where, data, select }) => {
    const row = state.quotes.find((item) => matches(item, where));
    if (!row) throw Object.assign(new Error("Stale"), { code: "P2025" });
    const { lineItems, ...fields } = data;
    Object.assign(row, fields, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    if (lineItems) row.lineItems = documentData({ ...row, lineItems }, "quote").lineItems;
    for (const field of ["subtotal", "taxTotal", "discountTotal", "grandTotal"])
      row[field] = new Prisma.Decimal(row[field]);
    return project(row, select);
  });
  mock.method(prisma.quotation, "updateMany", async ({ where, data }) => {
    const rows = state.quotes.filter((row) => matches(row, where));
    rows.forEach((row) => {
      Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    });
    return { count: rows.length };
  });
  mock.method(prisma.invoice, "create", async ({ data, select }) => {
    if (state.invoices.some((row) => row.quotationId === data.quotationId))
      throw Object.assign(new Error("Duplicate"), { code: "P2002" });
    const row = documentData(data, "invoice");
    state.invoices.push(row);
    return project(row, select);
  });
  mock.method(prisma.invoice, "findUniqueOrThrow", async ({ where, select }) => {
    const row = state.invoices.find((item) => matches(item, where));
    if (!row) throw new Error("Missing invoice");
    return project(row, select);
  });
  mock.method(quotationTransport, "renderDocumentPdf", async () => new TextEncoder().encode("%PDF-fixture"));
  mock.method(quotationTransport, "sendEmail", async () => ({ id: "email-1", sentAt: new Date() }));
});
function structuredCloneRows(rows) {
  return rows.map((row) => ({ ...row, lineItems: row.lineItems.map((line) => ({ ...line })) }));
}
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
});
async function created(body = input()) {
  const response = await create(request(body));
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}
const edited = (document) => ({
  contactId: document.contactId,
  companyId: document.companyId,
  dealId: document.dealId,
  issueDate: document.issueDate.slice(0, 10),
  expiryDate: document.expiryDate?.slice(0, 10) ?? null,
  currency: document.currency,
  notes: document.notes,
  terms: document.terms,
  updatedAt: document.updatedAt,
  lineItems: document.lineItems.map(({ id: _, position: __, total: ___, ...line }) => line),
});

test("quotations: decimal rounding discounts before tax and aggregation are exact", () => {
  const totals = calculateQuotation(input().lineItems);
  assert.deepEqual(
    [totals.subtotal, totals.discountTotal, totals.taxTotal, totals.grandTotal],
    ["0.30", "0.03", "0.05", "0.32"],
  );
  assert.equal(
    calculateQuotation([{ description: "Half cent", quantity: "1", unitPrice: "0.05", discount: "10", taxRate: "0" }])
      .grandTotal,
    "0.04",
  );
  assert.equal(
    calculateQuotation(
      Array.from({ length: 100 }, () => ({
        description: "Small",
        quantity: "1",
        unitPrice: "0.10",
        discount: "0",
        taxRate: "0",
      })),
    ).grandTotal,
    "10.00",
  );
  assert.throws(() =>
    calculateQuotation([
      { description: "Overflow", quantity: "99999999.99", unitPrice: "9999999999.99", discount: "0", taxRate: "0" },
    ]),
  );
});
test("quotations: strict schema refuses submitted totals, invalid dates, precision and missing clients", () => {
  assert.equal(createQuotationSchema.safeParse(input()).success, true);
  for (const body of [
    { ...input(), grandTotal: "0" },
    { ...input(), contactId: null },
    { ...input(), expiryDate: "2025-01-01" },
    { ...input(), lineItems: [{ ...input().lineItems[0], quantity: "0" }] },
    { ...input(), lineItems: [{ ...input().lineItems[0], discount: "100.01" }] },
    { ...input(), lineItems: [{ ...input().lineItems[0], unitPrice: "1.001" }] },
  ])
    assert.equal(createQuotationSchema.safeParse(body).success, false);
});
test("quotations: concurrent atomic sequence reservations are scoped by workspace, year and kind", async () => {
  const numbers = await Promise.all(
    Array.from({ length: 25 }, () => generateQuotationNumber("ws-1", prisma, new Date("2026-01-01"))),
  );
  assert.equal(new Set(numbers).size, 25);
  assert.equal(numbers[24], "QUO-2026-0025");
  assert.equal(await generateQuotationNumber("ws-2", prisma, new Date("2026-01-01")), "QUO-2026-0001");
  assert.equal(await generateQuotationNumber("ws-1", prisma, new Date("2027-01-01")), "QUO-2027-0001");
  assert.match(await generateInvoiceNumber("ws-1"), /^INV-/);
  assert.match(await generateContractNumber("ws-1"), /^CTR-/);
});
test("quotations: create stores immutable decimal snapshots and audit, retries do not duplicate", async () => {
  const body = input(),
    document = await created(body);
  assert.equal(document.grandTotal, "0.32");
  assert.equal(document.clientName, "Анна Иванова");
  assert.equal(document.lineItems[0].unitPrice, "0.1");
  assert.equal(document.workspaceId, undefined);
  assert.equal(document.requestDigest, undefined);
  const replay = await create(request(body));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).id, document.id);
  assert.equal(state.quotes.length, 1);
  assert.equal(state.audits.length, 1);
  assert.equal(state.sequences.get("ws-1:QUO:2026"), 1);
  assert.equal((await create(request({ ...body, notes: "Changed" }))).status, 409);
});
test("quotations: foreign clients, mismatched companies/deals and inactive/mixed-currency products are refused", async () => {
  assert.equal((await create(request({ ...input(), contactId: "foreign" }))).status, 403);
  state.companies.push({ id: "company-2", workspaceId: "ws-1", name: "Other" });
  assert.equal((await create(request({ ...input(), companyId: "company-2" }))).status, 400);
  state.deals[0].contactId = "other";
  assert.equal((await create(request({ ...input(), dealId: "deal-1" }))).status, 400);
  state.products[0].currency = "EUR";
  assert.equal((await create(request(input()))).status, 400);
  state.products[0].currency = "USD";
  state.products[0].isActive = false;
  assert.equal((await create(request(input()))).status, 400);
  assert.equal(state.quotes.length, 0);
});
test("quotations: anonymous/viewer writes, cross-tenant IDs and revoked related ACL are denied", async () => {
  const document = await created();
  globalThis.telephonyTestActor = null;
  assert.equal((await list(read("/api/quotations"))).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "VIEWER";
  assert.equal((await create(request(input()))).status, 403);
  assert.equal((await get(read("/"), context(document.id))).status, 200);
  member.workspaceId = "ws-2";
  assert.equal((await get(read("/"), context(document.id))).status, 404);
  assert.equal((await convert(request({ updatedAt: document.updatedAt }), context(document.id))).status, 403);
  member.workspaceId = "ws-1";
  member.role = "MEMBER";
  state.contacts[0].ownerId = "other";
  assert.equal((await get(read("/"), context(document.id))).status, 404);
  member.role = "OWNER";
  assert.equal((await get(read("/"), context(document.id))).status, 200);
});
test("quotations: owner isolation prevents member access to another creator’s document", async () => {
  const document = await created();
  state.quotes[0].ownerId = "other";
  member.role = "MEMBER";
  assert.equal((await get(read("/"), context(document.id))).status, 404);
  assert.equal((await patch(request(edited(document), "PATCH"), context(document.id))).status, 404);
});
test("quotations: edits replace ordered items, reject stale versions and preserve existing archived product references", async () => {
  const document = await created();
  state.products[0].deletedAt = new Date();
  state.products[0].currency = "EUR"; // Existing USD snapshots survive later catalog changes.
  const body = edited(document);
  body.lineItems[0].unitPrice = "10.00";
  body.lineItems.push({
    description: "Custom service",
    productId: null,
    quantity: "1",
    unitPrice: "20",
    discount: "0",
    taxRate: "0",
  });
  const response = await patch(request(body, "PATCH"), context(document.id));
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.equal(result.lineItems.length, 2);
  assert.equal(result.lineItems[1].position, 1);
  assert.equal(result.grandTotal, "52.4");
  assert.equal((await patch(request(body, "PATCH"), context(document.id))).status, 409);
});
test("quotations: audit failure rolls back draft, counter, conversion and status together", async () => {
  mock.method(prisma.auditLog, "create", async () => {
    throw new Error("audit failure");
  });
  assert.equal((await create(request(input()))).status, 500);
  assert.equal(state.quotes.length, 0);
  assert.equal(state.sequences.size, 0);
  mock.restoreAll();
});
test("quotations: conversion copies exact stored snapshots once and locks quotation editing", async () => {
  const document = await created();
  const response = await convert(request({ updatedAt: document.updatedAt }), context(document.id));
  assert.equal(response.status, 200);
  const invoice = await response.json();
  assert.equal(invoice.status, "DRAFT");
  assert.equal(invoice.grandTotal, document.grandTotal);
  assert.equal(invoice.lineItems[0].description, document.lineItems[0].description);
  assert.notEqual(invoice.lineItems[0].id, document.lineItems[0].id);
  assert.equal(state.quotes[0].status, "CONVERTED");
  const replay = await convert(request({ updatedAt: document.updatedAt }), context(document.id));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).id, invoice.id);
  assert.equal(state.invoices.length, 1);
  assert.equal((await patch(request(edited(document), "PATCH"), context(document.id))).status, 409);
});
test("quotations: failed conversion rolls back status and invoice number reservation", async () => {
  const document = await created();
  mock.method(prisma.auditLog, "create", async () => {
    throw new Error("audit failure");
  });
  assert.equal((await convert(request({ updatedAt: document.updatedAt }), context(document.id))).status, 500);
  assert.equal(state.quotes[0].status, "DRAFT");
  assert.equal(state.invoices.length, 0);
  assert.equal(
    [...state.sequences.keys()].some((key) => key.includes(":INV:")),
    false,
  );
});
test("quotations: send delivers escaped content and PDF then marks SENT; repeated send is idempotent", async () => {
  const document = await created();
  state.quotes[0].clientName = "<script>Client</script>";
  const response = await send(request({ accountId: "account-1", updatedAt: document.updatedAt }), context(document.id));
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.equal(result.status, "SENT");
  assert.equal(result.sendState, "SENT");
  const delivery = quotationTransport.sendEmail.mock.calls[0].arguments[0];
  assert.match(delivery.bodyHtml, /&lt;script&gt;/);
  assert.equal(delivery.attachments[0].filename, `${document.number}.pdf`);
  assert.equal(delivery.to[0], "anna@example.test");
  assert.equal(
    (await send(request({ accountId: "account-1", updatedAt: document.updatedAt }), context(document.id))).status,
    200,
  );
  assert.equal(quotationTransport.sendEmail.mock.callCount(), 1);
  assert.equal((await remove(request({ updatedAt: result.updatedAt }, "DELETE"), context(document.id))).status, 409);
});
test("quotations: provider uncertainty blocks retries, edits and conversion without another email", async () => {
  const document = await created();
  mock.method(quotationTransport, "sendEmail", async () => {
    throw new Error("timeout may be delivered");
  });
  assert.equal(
    (await send(request({ accountId: "account-1", updatedAt: document.updatedAt }), context(document.id))).status,
    502,
  );
  assert.equal(state.quotes[0].sendState, "UNCERTAIN");
  const current = state.quotes[0].updatedAt.toISOString();
  assert.equal((await send(request({ accountId: "account-1", updatedAt: current }), context(document.id))).status, 409);
  assert.equal(quotationTransport.sendEmail.mock.callCount(), 1);
  assert.equal((await convert(request({ updatedAt: current }), context(document.id))).status, 409);
});
test("quotations: sending refuses stale client email, foreign account and expired quotation before delivery", async () => {
  const document = await created();
  state.contacts[0].email = "changed@example.test";
  assert.equal(
    (await send(request({ accountId: "account-1", updatedAt: document.updatedAt }), context(document.id))).status,
    409,
  );
  state.contacts[0].email = document.clientEmail;
  assert.equal(
    (await send(request({ accountId: "foreign", updatedAt: document.updatedAt }), context(document.id))).status,
    400,
  );
  state.quotes[0].expiryDate = new Date("2020-01-01");
  assert.equal(
    (await send(request({ accountId: "account-1", updatedAt: document.updatedAt }), context(document.id))).status,
    409,
  );
  assert.equal(quotationTransport.sendEmail.mock.callCount(), 0);
});
test("quotations: manual acceptance requires SENT and valid version; expired filter is computed", async () => {
  const document = await created();
  assert.equal(
    (await patch(request({ updatedAt: document.updatedAt, status: "ACCEPTED" }, "PATCH"), context(document.id))).status,
    409,
  );
  state.quotes[0].status = "SENT";
  const response = await patch(
    request({ updatedAt: document.updatedAt, status: "ACCEPTED" }, "PATCH"),
    context(document.id),
  );
  assert.equal(response.status, 200);
  state.quotes[0].status = "DRAFT";
  state.quotes[0].expiryDate = new Date("2020-01-01");
  assert.equal((await (await list(read("/api/quotations?status=EXPIRED"))).json()).total, 1);
  assert.equal((await (await list(read("/api/quotations?status=DRAFT"))).json()).total, 0);
});
test("quotations: draft deletion is soft, version-checked and audit-recorded", async () => {
  const document = await created();
  assert.equal(
    (await remove(request({ updatedAt: "2000-01-01T00:00:00Z" }, "DELETE"), context(document.id))).status,
    409,
  );
  assert.equal((await remove(request({ updatedAt: document.updatedAt }, "DELETE"), context(document.id))).status, 204);
  assert.ok(state.quotes[0].deletedAt);
  assert.equal(state.audits.at(-1).action, "DELETE");
  assert.equal((await get(read("/"), context(document.id))).status, 404);
});
test("quotations: options and malformed/bounded JSON do not leak data or write", async () => {
  const result = await options(read("/api/quotations/options?type=contact"));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).options[0].label, "Анна Иванова");
  assert.equal(
    (
      await create(
        new Request("https://crm.test/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await create(
        new Request("https://crm.test/", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" }),
      )
    ).status,
    415,
  );
  assert.equal((await create(request({ text: "x".repeat(140000) }))).status, 413);
  assert.equal(state.quotes.length, 0);
});
test("quotations: real PDF generation supports Cyrillic and paginates long descriptions/terms", async () => {
  const document = await created();
  document.lineItems = Array.from({ length: 100 }, (_, index) => ({
    ...document.lineItems[0],
    id: `line-${index}`,
    description: `Строка ${index + 1}: ${"Длинное описание услуги ".repeat(15)}`,
  }));
  document.terms = "Условия оплаты\n".repeat(100);
  const bytes = await renderDocumentPdf(document);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 5);
  assert.equal(pdf.getTitle(), `Quotation ${document.number}`);
});
test("quotations: saved/unsaved PDF routes return actual private PDF without creating a draft", async () => {
  const document = await created();
  const response = await pdfRoute(read("/api/quotations/id/pdf?download=1"), context(document.id));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(
    Buffer.from(await response.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    "%PDF-",
  );
  const { requestId: _, ...body } = input();
  const result = await preview(request(body));
  assert.equal(result.status, 200);
  assert.equal(state.quotes.length, 1);
});
test("quotations: Gmail MIME and Graph attachment bytes preserve PDF with valid wrapped base64", () => {
  const attachment = {
    filename: "QUO-2026-0001.pdf",
    contentType: "application/pdf",
    content: new TextEncoder().encode(`%PDF-${"x".repeat(300)}`),
  };
  const mime = emailMimeContent("<p>Привет</p>", [attachment], "fixture-boundary").join("\r\n");
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /Content-Disposition: attachment/);
  assert.ok(mime.split("\r\n").every((line) => line.length < 998));
  assert.match(mime, /--fixture-boundary--/);
  const graph = graphPdfAttachments([attachment]);
  assert.deepEqual(Buffer.from(graph[0].contentBytes, "base64"), Buffer.from(attachment.content));
  assert.equal(graph[0]["@odata.type"], "#microsoft.graph.fileAttachment");
});
