import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { DocumentPaper } from "@/app/(dashboard)/dashboard/quotations/_components/document-paper";
import { QuotationDetail } from "@/app/(dashboard)/dashboard/quotations/_components/quotation-detail";
import { QuotationEditor } from "@/app/(dashboard)/dashboard/quotations/_components/quotation-editor";
import { QuotationsList } from "@/app/(dashboard)/dashboard/quotations/_components/quotations-list";
import { Button } from "@/components/ui/button";
import { calculateQuotation } from "@/lib/quotations/totals";
import { type DocumentRow, type QuotationInput, quotationFields } from "@/lib/validations/quotation";

const now = new Date().toISOString();
const fixtureInput: QuotationInput = {
  contactId: "fixture-contact",
  companyId: null,
  issueDate: now.slice(0, 10),
  expiryDate: "2099-12-31",
  currency: "USD",
  lineItems: [
    {
      productId: "fixture-product",
      description: "Консультация и проектирование",
      quantity: "2",
      unitPrice: "125.50",
      discount: "10",
      taxRate: "19",
    },
  ],
  notes: "Пример коммерческого предложения. Только тестовые данные.",
  terms: "Условия согласуются с клиентом.",
};
function savedDocument(input: QuotationInput, id: string, number: string): DocumentRow {
  const totals = calculateQuotation(input.lineItems);
  return {
    ...input,
    ...totals,
    id,
    number,
    status: "DRAFT",
    sendState: "IDLE",
    contactId: input.contactId ?? null,
    companyId: input.companyId ?? null,
    dealId: null,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    clientName: input.companyId ? "Example Company" : "Анна Иванова (fixture)",
    clientEmail: input.contactId ? "client@example.test" : null,
    issuerName: "Example Studio",
    updatedAt: now,
    canWrite: true,
    invoices: [],
    lineItems: totals.lineItems.map((line, index) => ({ ...line, id: `${id}-line-${index}` })),
  };
}
let quotes = [savedDocument(fixtureInput, "fixture-quote", "QUO-2026-0001")];
let invoice: DocumentRow | null = null;
let canWrite = true;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/"))
    throw new Error("Fixture preview blocks non-fixture requests.");
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.pathname === "/api/email-accounts")
    return Response.json({ accounts: [{ id: "fixture-email", email: "sender@example.test" }] });
  if (url.pathname === "/api/products")
    return Response.json({
      products: [
        {
          id: "fixture-product",
          name: "Consulting hour",
          sku: "CONSULT-01",
          unitPrice: "125.50",
          taxRate: "19",
          currency: "USD",
        },
        {
          id: "fixture-license",
          name: "Software license",
          sku: "LIC-01",
          unitPrice: "49.99",
          taxRate: "0",
          currency: "USD",
        },
      ],
    });
  if (url.pathname === "/api/quotations/options")
    return Response.json({
      options:
        url.searchParams.get("type") === "company"
          ? [{ id: "fixture-company", label: "Example Company" }]
          : [
              {
                id: "fixture-contact",
                label: "Анна Иванова (fixture)",
                email: "client@example.test",
                companyId: "fixture-company",
              },
            ],
    });
  if (url.pathname === "/api/quotations/preview") {
    const parsed = quotationFields.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Complete client and items." }, { status: 400 });
    return nativeFetch("/fixture-pdf", {
      method: "POST",
      body: JSON.stringify(savedDocument(parsed.data, "pdf-preview", "UNSAVED DRAFT")),
    });
  }
  const id = url.pathname.split("/")[3],
    quote = quotes.find((row) => row.id === id),
    method = init?.method ?? "GET";
  if (id && !quote) return Response.json({ error: "Quotation not found." }, { status: 404 });
  if (quote) {
    if (method === "DELETE") {
      quotes = quotes.filter((row) => row.id !== id);
      return new Response(null, { status: 204 });
    }
    if (method !== "GET" && body.updatedAt !== quote.updatedAt)
      return Response.json({ error: "Reload stale draft." }, { status: 409 });
    if (url.pathname.endsWith("/send")) {
      quote.status = "SENT";
      quote.sendState = "SENT";
      quote.updatedAt = new Date().toISOString();
      return Response.json({ ...quote, canWrite });
    }
    if (url.pathname.endsWith("/convert")) {
      invoice = {
        ...quote,
        id: "fixture-invoice",
        number: "INV-2026-0001",
        status: "DRAFT",
        lineItems: quote.lineItems.map((line) => ({ ...line, id: `invoice-${line.id}` })),
      };
      quote.status = "CONVERTED";
      quote.invoices = [{ id: invoice.id, number: invoice.number }];
      return Response.json(invoice);
    }
    if (method === "PATCH") {
      if (body.status) Object.assign(quote, { status: body.status, updatedAt: new Date().toISOString() });
      else {
        const parsed = quotationFields.safeParse(
          Object.fromEntries(Object.entries(body).filter(([key]) => key !== "updatedAt")),
        );
        if (!parsed.success) return Response.json({ error: "Check draft fields." }, { status: 400 });
        Object.assign(quote, savedDocument(parsed.data, quote.id, quote.number), {
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return Response.json({ ...quote, canWrite });
  }
  if (method === "POST") {
    const parsed = quotationFields.safeParse(
      Object.fromEntries(Object.entries(body).filter(([key]) => key !== "requestId")),
    );
    if (!parsed.success) return Response.json({ error: "Check draft fields." }, { status: 400 });
    const row = savedDocument(
      parsed.data,
      crypto.randomUUID(),
      `QUO-2026-${String(quotes.length + 1).padStart(4, "0")}`,
    );
    quotes.unshift(row);
    return Response.json(row, { status: 201 });
  }
  const search = (url.searchParams.get("search") ?? "").toLowerCase();
  const rows = quotes.filter(
    (row) =>
      `${row.number} ${row.clientName}`.toLowerCase().includes(search) &&
      (!url.searchParams.get("status") || row.status === url.searchParams.get("status")),
  );
  return Response.json({ quotations: rows, total: rows.length, totalPages: 1 });
};
function Preview() {
  const [screen, setScreen] = useState("/dashboard/quotations"),
    [viewer, setViewer] = useState(false);
  const id = screen.substring(screen.lastIndexOf("/") + 1);
  let content = (
    <QuotationDetail key={`${viewer}:${id}`} workspaceId="fixture-workspace" id={id} onNavigate={setScreen} />
  );
  if (id === "quotations")
    content = <QuotationsList workspaceId="fixture-workspace" canWrite={!viewer} onNavigate={setScreen} />;
  if (screen.includes("/invoices/") && invoice) content = <DocumentPaper document={invoice} kind="Invoice" />;
  if (screen.endsWith("/new"))
    content = (
      <QuotationEditor
        workspaceId="fixture-workspace"
        issuerName="Example Studio"
        onSaved={(document) => setScreen(`/dashboard/quotations/${document.id}`)}
      />
    );
  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-muted p-3 text-sm">
        <p>UI test fixtures — no live CRM, database or email delivery</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScreen("/dashboard/quotations")}>
            Fixture list
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              canWrite = !canWrite;
              setViewer(!viewer);
              setScreen("/dashboard/quotations");
            }}
          >
            {viewer ? "Manager preview" : "Viewer preview"}
          </Button>
        </div>
      </div>
      {content}
    </main>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Preview />
  </QueryClientProvider>,
);
