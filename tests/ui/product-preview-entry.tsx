import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { ProductsCatalog } from "@/app/(dashboard)/dashboard/products/_components/products-catalog";
import { Button } from "@/components/ui/button";
import { createProductSchema, type ProductRow, updateProductSchema } from "@/lib/validations/product";

// Fixture-only transport. Never mounts auth, Prisma or a provider client.
const now = new Date().toISOString();
let products: ProductRow[] = Array.from({ length: 24 }, (_, index) => ({
  id: `fixture-${index}`,
  name: ["Consulting hour", "Website maintenance"][index] ?? `Software license ${String(index).padStart(2, "0")}`,
  sku: `DEMO-${index}`,
  description: null,
  unitPrice: index === 0 ? "125.50" : "49.99",
  currency: "USD",
  unit: ["hour", "month"][index] ?? "license",
  taxRate: "19",
  isActive: index !== 1,
  category: index < 2 ? "Services" : "Licenses",
  imageUrl: null,
  createdAt: now,
  updatedAt: now,
}));
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (url.origin !== window.location.origin || !/^\/api\/products(?:\/[^/]+)?$/.test(url.pathname))
    throw new Error("Preview blocks non-fixture requests.");
  const id = url.pathname.split("/")[3];
  const product = products.find((item) => item.id === id);
  const method = init?.method ?? "GET";
  if (id && !product) return Response.json({ error: "Product not found." }, { status: 404 });
  if (method === "DELETE") {
    products = products.filter((item) => item.id !== id);
    return new Response(null, { status: 204 });
  }
  if (method === "POST" || method === "PATCH") {
    const body = JSON.parse(String(init?.body));
    const parsed = (method === "POST" ? createProductSchema : updateProductSchema).safeParse(body);
    if (!parsed.success) return Response.json({ error: "Check product details." }, { status: 400 });
    if (product && body.updatedAt !== product.updatedAt)
      return Response.json({ error: "Reload the changed product." }, { status: 409 });
    if (parsed.data.sku && products.some((item) => item.id !== id && item.sku === parsed.data.sku))
      return Response.json(
        { error: "SKU already exists.", fieldErrors: { sku: ["SKU already exists."] } },
        { status: 409 },
      );
    const updatedAt = new Date(Date.now() + 1).toISOString();
    const saved: ProductRow = {
      id: crypto.randomUUID(),
      sku: null,
      description: null,
      category: null,
      imageUrl: null,
      name: "",
      unitPrice: "0",
      taxRate: "0",
      currency: "USD",
      unit: "unit",
      isActive: true,
      createdAt: now,
      ...product,
      ...parsed.data,
      updatedAt,
    };
    if (product) products = products.map((item) => (item.id === id ? saved : item));
    else products.push(saved);
    return Response.json(saved, { status: product ? 200 : 201 });
  }
  if (product) return Response.json(product);
  const params = url.searchParams;
  const search = (params.get("search") ?? "").toLowerCase();
  const category = params.get("category");
  const active = params.get("isActive");
  const rows = products.filter(
    (item) =>
      (!search || `${item.name} ${item.sku}`.toLowerCase().includes(search)) &&
      (!category || item.category === category) &&
      (active === null || item.isActive === (active === "true")),
  );
  const sort = (params.get("sortBy") ?? "name") as keyof ProductRow;
  rows.sort((left, right) => {
    const comparison =
      sort === "unitPrice"
        ? Number(left.unitPrice) - Number(right.unitPrice)
        : String(left[sort] ?? "").localeCompare(String(right[sort] ?? ""));
    return params.get("sortOrder") === "desc" ? -comparison : comparison;
  });
  const page = Number(params.get("page") ?? 1);
  const limit = Number(params.get("limit") ?? 20);
  return Response.json({
    products: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
    totalPages: Math.ceil(rows.length / limit),
    categories: [...new Set(products.flatMap((item) => (item.category ? [item.category] : [])))].sort(),
  });
};
function Preview() {
  const [canWrite, setCanWrite] = useState(true);
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-3 text-sm">
        <p>UI test fixtures — no live CRM/database connections</p>
        <Button variant="outline" onClick={() => setCanWrite((value) => !value)}>
          {canWrite ? "Preview Viewer role" : "Preview Manager role"}
        </Button>
      </div>
      <ProductsCatalog key={String(canWrite)} workspaceId="fixture-workspace" canWrite={canWrite} />
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root.");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Preview />
  </QueryClientProvider>,
);
