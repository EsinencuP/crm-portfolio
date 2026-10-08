import { useState } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { InvoiceDetail } from "@/app/(dashboard)/dashboard/invoices/_components/invoice-detail";
import { InvoicesList } from "@/app/(dashboard)/dashboard/invoices/_components/invoices-list";
import { QuotationEditor } from "@/app/(dashboard)/dashboard/quotations/_components/quotation-editor";
import { Button } from "@/components/ui/button";
import { applyInvoicePayment, effectiveInvoiceStatus } from "@/lib/invoices/money";
import { calculateQuotation } from "@/lib/quotations/totals";
import { type InvoiceInput, invoiceFields, type PaymentRow } from "@/lib/validations/invoice";
import type { DocumentRow } from "@/lib/validations/quotation";

const fixtureInput: InvoiceInput = {
  contactId: "fixture-contact",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "2099-12-31",
  currency: "USD",
  lineItems: [
    { description: "Консультация и проектирование", quantity: "2", unitPrice: "125.50", discount: "10", taxRate: "19" },
  ],
  notes: "Только тестовые данные.",
  terms: "Условия согласуются с клиентом.",
};
function savedDocument(input: InvoiceInput, id: string, number: string): DocumentRow {
  const totals = calculateQuotation(input.lineItems);
  return {
    ...input,
    ...totals,
    id,
    number,
    status: "DRAFT",
    sendState: "IDLE",
    amountPaid: "0",
    issuerName: "Example Studio",
    clientName: "Анна Иванова (fixture)",
    clientEmail: "client@example.test",
    contactId: input.contactId ?? null,
    companyId: input.companyId ?? null,
    dealId: input.dealId ?? null,
    notes: input.notes ?? null,
    terms: input.terms ?? null,
    updatedAt: new Date().toISOString(),
    canWrite: true,
    lineItems: totals.lineItems.map((line, index) => ({ ...line, id: `${id}-line-${index}` })),
  };
}
let invoices: DocumentRow[] = [
  savedDocument(fixtureInput, "fixture-invoice", "INV-2026-0001"),
  {
    ...savedDocument(fixtureInput, "overdue-invoice", "INV-2025-0002"),
    issueDate: "2025-01-01",
    dueDate: "2025-02-01",
    status: "SENT",
    sendState: "SENT",
  },
];
const payments: Record<string, PaymentRow[]> = {},
  requests = new Map<string, { invoice: DocumentRow; payment: PaymentRow }>();
let canWrite = true;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(String(input), window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/"))
    throw new Error("Fixture preview blocks non-fixture requests.");
  const body = init?.body ? JSON.parse(String(init.body)) : {},
    method = init?.method ?? "GET";
  if (url.pathname === "/api/email-accounts")
    return Response.json({ accounts: [{ id: "fixture-email", email: "sender@example.test" }] });
  if (url.pathname === "/api/quotations/options")
    return Response.json({
      options: [{ id: "fixture-contact", label: "Анна Иванова (fixture)", email: "client@example.test" }],
    });
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
      ],
    });
  if (url.pathname === "/api/invoices/preview") {
    const parsed = invoiceFields.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Complete client and items." }, { status: 400 });
    return nativeFetch("/fixture-pdf", {
      method: "POST",
      body: JSON.stringify(savedDocument(parsed.data, "preview", "UNSAVED DRAFT")),
    });
  }
  const id = url.pathname.split("/")[3],
    invoice = invoices.find((row) => row.id === id);
  if (id && !invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice) {
    if (url.pathname.endsWith("/payments")) {
      if (method === "GET") {
        const rows = payments[id] ?? [];
        return Response.json({ payments: rows, total: rows.length, totalPages: 1 });
      }
      const prior = requests.get(body.requestId);
      if (prior) return Response.json(prior);
      try {
        const totals = applyInvoicePayment(invoice.grandTotal, invoice.amountPaid ?? "0", body.amount),
          payment: PaymentRow = {
            id: crypto.randomUUID(),
            amount: body.amount,
            currency: invoice.currency,
            method: body.method,
            status: "COMPLETED",
            paidAt: body.paidAt,
            reference: body.reference ?? null,
            notes: body.notes ?? null,
            createdAt: new Date().toISOString(),
          };
        Object.assign(invoice, {
          amountPaid: totals.amountPaid,
          status: totals.status,
          updatedAt: new Date().toISOString(),
        });
        payments[id] ??= [];
        payments[id].unshift(payment);
        const result = { invoice: { ...invoice, canWrite }, payment };
        requests.set(body.requestId, result);
        return Response.json(result, { status: 201 });
      } catch (error) {
        return Response.json({ error: String(error) }, { status: 400 });
      }
    }
    if (method !== "GET" && !canWrite) return Response.json({ error: "Viewer role is read-only." }, { status: 403 });
    if (method !== "GET" && body.updatedAt !== invoice.updatedAt)
      return Response.json({ error: "Reload stale invoice." }, { status: 409 });
    if (method === "DELETE") {
      invoices = invoices.filter((row) => row.id !== id);
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/send"))
      Object.assign(invoice, {
        status: Number(invoice.amountPaid) > 0 ? invoice.status : "SENT",
        sendState: "SENT",
        updatedAt: new Date().toISOString(),
      });
    else if (method === "PATCH") {
      if (body.status) Object.assign(invoice, { status: body.status, updatedAt: new Date().toISOString() });
      else {
        const parsed = invoiceFields.safeParse(
          Object.fromEntries(Object.entries(body).filter(([key]) => key !== "updatedAt")),
        );
        if (!parsed.success) return Response.json({ error: "Check draft fields." }, { status: 400 });
        Object.assign(invoice, savedDocument(parsed.data, id, invoice.number));
      }
    }
    return Response.json({ ...invoice, canWrite });
  }
  if (method === "POST") {
    const parsed = invoiceFields.safeParse(
      Object.fromEntries(Object.entries(body).filter(([key]) => key !== "requestId")),
    );
    if (!parsed.success) return Response.json({ error: "Check draft fields." }, { status: 400 });
    const invoice = savedDocument(
      parsed.data,
      crypto.randomUUID(),
      `INV-2026-${String(invoices.length + 1).padStart(4, "0")}`,
    );
    invoices.unshift(invoice);
    return Response.json(invoice, { status: 201 });
  }
  const search = (url.searchParams.get("search") ?? "").toLowerCase(),
    status = url.searchParams.get("status"),
    rows = invoices.filter(
      (row) =>
        `${row.number} ${row.clientName}`.toLowerCase().includes(search) &&
        (!status || effectiveInvoiceStatus(row) === status),
    );
  return Response.json({ invoices: rows, total: rows.length, totalPages: 1 });
};
function Preview() {
  const [screen, setScreen] = useState("/dashboard/invoices"),
    [viewer, setViewer] = useState(false);
  const id = screen.substring(screen.lastIndexOf("/") + 1);
  let content = (
    <InvoiceDetail key={`${viewer}:${id}`} workspaceId="fixture-workspace" id={id} onNavigate={setScreen} />
  );
  if (id === "invoices")
    content = (
      <InvoicesList key={String(viewer)} workspaceId="fixture-workspace" canWrite={!viewer} onNavigate={setScreen} />
    );
  if (id === "new")
    content = (
      <QuotationEditor
        workspaceId="fixture-workspace"
        issuerName="Example Studio"
        documentKind="Invoice"
        onSaved={(invoice) => setScreen(`/dashboard/invoices/${invoice.id}`)}
      />
    );
  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-muted p-3 text-sm">
        <p>UI test fixtures — no live database, email or payment transfers</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setScreen("/dashboard/invoices")}>
            Fixture list
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              canWrite = !canWrite;
              setViewer(!viewer);
              setScreen("/dashboard/invoices");
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
