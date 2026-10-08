import { Prisma } from "@prisma/client";

import {
  DELETE as deleteProduct,
  GET as getProduct,
  PATCH as patchProduct,
} from "../src/app/api/products/[id]/route.ts";
import { POST as createProduct, GET as listProducts } from "../src/app/api/products/route.ts";
import { prisma } from "../src/lib/prisma.ts";
import { createProductSchema, updateProductSchema } from "../src/lib/validations/product.ts";
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

let state;
let member;
const context = (id) => ({ params: Promise.resolve({ id }) });
const json = (body, method = "POST") =>
  new Request("https://crm.test/api/products", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const query = (filters = "") => new Request(`https://crm.test/api/products?${filters}`);
const valid = {
  name: "Consulting",
  sku: "consult-01",
  unitPrice: "1234.56",
  taxRate: "19.00",
  currency: "EUR",
  unit: "hour",
  category: "Services",
};
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item) => matches(row, item));
    if (value instanceof Date) return row[key]?.getTime() === value.getTime();
    if (value && typeof value === "object") {
      if ("not" in value) return row[key] !== value.not;
      if ("contains" in value)
        return typeof row[key] === "string" && row[key].toLowerCase().includes(value.contains.toLowerCase());
      if ("equals" in value)
        return typeof row[key] === "string" && row[key].toLowerCase() === value.equals.toLowerCase();
    }
    return row[key] === value;
  });
}
const project = (row, select) =>
  row &&
  (select
    ? Object.fromEntries(
        Object.keys(select)
          .filter((key) => select[key])
          .map((key) => [key, row[key]]),
      )
    : { ...row });
function stored(row) {
  return {
    ...row,
    unitPrice: new Prisma.Decimal(row.unitPrice),
    taxRate: new Prisma.Decimal(row.taxRate),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
  };
}
beforeEach(() => {
  globalThis.telephonyTestActor = { id: "user-1" };
  member = { userId: "user-1", workspaceId: "workspace-1", role: "MANAGER" };
  state = { products: [], audits: [] };
  mock.method(prisma.workspaceMember, "findFirst", async () => member);
  mock.method(prisma, "$transaction", async (callback) => {
    const snapshot = { products: state.products.map((row) => ({ ...row })), audits: [...state.audits] };
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
  mock.method(prisma.product, "create", async ({ data, select }) => {
    if (data.sku && state.products.some((row) => row.sku === data.sku && row.workspaceId === data.workspaceId))
      throw Object.assign(new Error("Unique SKU"), { code: "P2002" });
    const now = new Date();
    const row = stored({
      id: `product-${state.products.length + 1}`,
      description: null,
      sku: null,
      category: null,
      imageUrl: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      ...data,
    });
    state.products.push(row);
    return project(row, select);
  });
  mock.method(prisma.product, "findFirst", async ({ where, select }) =>
    project(
      state.products.find((row) => matches(row, where)),
      select,
    ),
  );
  mock.method(prisma.product, "count", async ({ where }) => state.products.filter((row) => matches(row, where)).length);
  mock.method(prisma.product, "findMany", async ({ where, select, skip = 0, take = 100, orderBy = [], distinct }) => {
    let rows = state.products.filter((row) => matches(row, where));
    const order = Array.isArray(orderBy) ? orderBy : [orderBy];
    rows.sort((a, b) => {
      for (const field of order) {
        const [key, direction] = Object.entries(field)[0];
        const left = a[key];
        const right = b[key];
        const diff =
          left instanceof Prisma.Decimal
            ? left.comparedTo(right)
            : String(left ?? "").localeCompare(String(right ?? ""));
        if (diff) return direction === "desc" ? -diff : diff;
      }
      return 0;
    });
    if (distinct)
      rows = rows.filter(
        (row, index) => rows.findIndex((other) => distinct.every((key) => other[key] === row[key])) === index,
      );
    return rows.slice(skip, skip + take).map((row) => project(row, select));
  });
  mock.method(prisma.product, "update", async ({ where, data, select }) => {
    const row = state.products.find((row) => matches(row, where));
    if (!row) throw Object.assign(new Error("Stale/missing product"), { code: "P2025" });
    if (
      data.sku &&
      state.products.some(
        (other) => other.id !== row.id && other.workspaceId === row.workspaceId && other.sku === data.sku,
      )
    )
      throw Object.assign(new Error("Unique SKU"), { code: "P2002" });
    Object.assign(row, data, { updatedAt: new Date(row.updatedAt.getTime() + 1) });
    if (data.unitPrice !== undefined) row.unitPrice = new Prisma.Decimal(data.unitPrice);
    if (data.taxRate !== undefined) row.taxRate = new Prisma.Decimal(data.taxRate);
    return project(row, select);
  });
});
afterEach(() => {
  mock.restoreAll();
  delete globalThis.telephonyTestActor;
});
const create = async (fields = {}) => {
  const response = await createProduct(json({ ...valid, ...fields }));
  assert.equal(response.status, 201);
  return response.json();
};

test("products: decimal precision, limits, tax, currencies and strict inputs are validated", () => {
  const product = createProductSchema.parse({
    name: " Service ",
    sku: " mixed-Sku ",
    unitPrice: "9999999999.99",
    taxRate: 100,
  });
  assert.equal(product.unitPrice, "9999999999.99");
  assert.equal(product.sku, "MIXED-SKU");
  assert.equal(product.name, "Service");
  for (const patch of [
    { unitPrice: "10000000000" },
    { unitPrice: -1 },
    { unitPrice: "0.001" },
    { unitPrice: "" },
    { unitPrice: "1e2" },
    { taxRate: "100.01" },
    { taxRate: -1 },
    { currency: "ZZZ" },
    { unit: "piece" },
    { workspaceId: "foreign" },
    { imageUrl: "https://user:password@example.com/image.jpg" },
  ])
    assert.equal(createProductSchema.safeParse({ ...valid, ...patch }).success, false);
  const partial = updateProductSchema.parse({ updatedAt: new Date().toISOString(), isActive: false });
  assert.deepEqual(Object.keys(partial).sort(), ["isActive", "updatedAt"]);
});
test("products: creation stores Decimal exactly, workspace and audit, returning safe DTO", async () => {
  const product = await create();
  assert.equal(product.unitPrice, "1234.56");
  assert.equal(product.taxRate, "19");
  assert.equal(product.sku, "CONSULT-01");
  assert.equal(product.workspaceId, undefined);
  assert.equal(state.products[0].workspaceId, "workspace-1");
  assert.equal(state.audits[0].entityType, "Product");
  assert.equal(state.audits[0].action, "CREATE");
});
test("products: normalized SKU is unique per workspace; null SKUs can be repeated", async () => {
  await create();
  assert.equal((await createProduct(json({ ...valid, sku: " CoNsUlT-01 " }))).status, 409);
  member.workspaceId = "workspace-2";
  await create();
  await create({ sku: "" });
  await create({ sku: null });
  assert.equal(state.products.filter((row) => row.sku === null).length, 2);
});
test("products: anonymous/viewer writes fail while viewers can read only their workspace", async () => {
  const product = await create();
  globalThis.telephonyTestActor = null;
  assert.equal((await listProducts(query())).status, 401);
  assert.equal((await createProduct(json(valid))).status, 401);
  globalThis.telephonyTestActor = { id: "user-1" };
  member.role = "VIEWER";
  assert.equal((await listProducts(query())).status, 200);
  assert.equal((await createProduct(json(valid))).status, 403);
  assert.equal(
    (await patchProduct(json({ name: "Blocked", updatedAt: product.updatedAt }), context(product.id))).status,
    403,
  );
  assert.equal((await deleteProduct(query(), context(product.id))).status, 403);
  assert.equal(state.products.length, 1);
});
test("products: list/search/category/false-active filtering, price sort and pagination are scoped", async () => {
  await create({ sku: "sku-a", name: "Alpha", unitPrice: "2", isActive: false });
  await create({ sku: "sku-b", name: "Beta", unitPrice: "10" });
  member.workspaceId = "workspace-2";
  await create({ sku: "foreign", name: "Foreign", category: "Private" });
  member.workspaceId = "workspace-1";
  let body = await (await listProducts(query("search=SKU-a&category=services&isActive=false"))).json();
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0].name, "Alpha");
  assert.deepEqual(body.categories, ["Services"]);
  body = await (await listProducts(query("limit=1&page=2&sortBy=unitPrice&sortOrder=asc"))).json();
  assert.equal(body.products[0].name, "Beta");
  assert.equal(body.total, 2);
  assert.equal(body.totalPages, 2);
  assert.equal((await listProducts(query("isActive=0"))).status, 400);
  assert.equal((await listProducts(query("page=-1"))).status, 400);
});
test("products: foreign IDs never expose or modify records", async () => {
  const product = await create();
  member.workspaceId = "workspace-2";
  assert.equal((await getProduct(query(), context(product.id))).status, 404);
  assert.equal(
    (await patchProduct(json({ name: "Foreign", updatedAt: product.updatedAt }), context(product.id))).status,
    404,
  );
  assert.equal((await deleteProduct(query(), context(product.id))).status, 404);
  assert.equal(state.products[0].name, valid.name);
  assert.equal(state.products[0].deletedAt, null);
});
test("products: PATCH preserves omitted defaults, audits price changes and rejects stale versions", async () => {
  const product = await create({ isActive: false });
  let response = await patchProduct(json({ unitPrice: "0.01", updatedAt: product.updatedAt }), context(product.id));
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.unitPrice, "0.01");
  assert.equal(updated.currency, "EUR");
  assert.equal(updated.unit, "hour");
  assert.equal(updated.taxRate, "19");
  assert.equal(updated.isActive, false);
  assert.deepEqual(state.audits.at(-1).changes.unitPrice, { old: "1234.56", new: "0.01" });
  response = await patchProduct(json({ name: "Stale", updatedAt: product.updatedAt }), context(product.id));
  assert.equal(response.status, 409);
  assert.equal(state.products[0].name, valid.name);
  assert.equal((await patchProduct(json({ name: "No version" }), context(product.id))).status, 400);
});
test("products: clear optional values and duplicate SKU patches behave predictably", async () => {
  const first = await create();
  const second = await create({ sku: "other", description: "Description" });
  assert.equal(
    (await patchProduct(json({ sku: first.sku.toLowerCase(), updatedAt: second.updatedAt }), context(second.id)))
      .status,
    409,
  );
  const response = await patchProduct(
    json({ sku: "", description: "", category: "", imageUrl: "", updatedAt: second.updatedAt }),
    context(second.id),
  );
  assert.equal(response.status, 200);
  const cleared = await response.json();
  for (const key of ["sku", "description", "category", "imageUrl"]) assert.equal(cleared[key], null);
});
test("products: DELETE hides records, keeps SKU reserved and is audited", async () => {
  const product = await create();
  assert.equal((await deleteProduct(query(), context(product.id))).status, 204);
  assert.equal(state.products.length, 1);
  assert.ok(state.products[0].deletedAt);
  assert.equal(state.products[0].isActive, false);
  assert.equal((await getProduct(query(), context(product.id))).status, 404);
  assert.equal((await (await listProducts(query())).json()).total, 0);
  assert.equal((await createProduct(json(valid))).status, 409);
  assert.equal(state.audits.at(-1).action, "DELETE");
});
test("products: audit failure rolls back create, update and delete", async () => {
  const product = await create();
  mock.method(prisma.auditLog, "create", async () => {
    throw new Error("Audit unavailable");
  });
  assert.equal((await createProduct(json({ ...valid, sku: "rollback" }))).status, 500);
  assert.equal(
    (await patchProduct(json({ unitPrice: "10", updatedAt: product.updatedAt }), context(product.id))).status,
    500,
  );
  assert.equal((await deleteProduct(query(), context(product.id))).status, 500);
  assert.equal(state.products.length, 1);
  assert.equal(state.products[0].unitPrice.toString(), "1234.56");
  assert.equal(state.products[0].deletedAt, null);
});
test("products: malformed, oversized and wrong-type requests are rejected before DB mutations", async () => {
  assert.equal((await createProduct(new Request("https://crm.test", { method: "POST", body: "{}" }))).status, 415);
  assert.equal(
    (
      await createProduct(
        new Request("https://crm.test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }),
      )
    ).status,
    400,
  );
  assert.equal((await createProduct(json({ name: "x".repeat(40000), unitPrice: 0 }))).status, 413);
  assert.equal(state.products.length, 0);
});
test("products: missing membership fails before reads or writes", async () => {
  member = null;
  assert.equal((await listProducts(query())).status, 409);
  assert.equal((await createProduct(json(valid))).status, 409);
});
