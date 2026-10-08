import { useState } from "react";

import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";

import { ContractDetail } from "../../src/app/(dashboard)/dashboard/contracts/_components/contract-detail";
import { ContractFormSheet } from "../../src/app/(dashboard)/dashboard/contracts/_components/contract-form-sheet";
import { ContractsList } from "../../src/app/(dashboard)/dashboard/contracts/_components/contracts-list";
import { Button } from "../../src/components/ui/button";
import { type ContractRow, contractStateSchema, nextContractState } from "../../src/lib/validations/contract";

const row: ContractRow = {
  id: "fixture-1",
  title: "Договор сопровождения CRM",
  number: "CTR-2026-0001",
  status: "DRAFT",
  value: "12500.50",
  currency: "EUR",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  content:
    "# Договор услуг\n## Предмет договора\n**Сопровождение CRM** и поддержка команды.\n- Ежемесячные обновления\n- Поддержка пользователей\n\n<script>alert('HTML is text')</script>",
  documentUrl: null,
  signedByClient: false,
  signedByUs: false,
  contactId: "contact-1",
  companyId: null,
  dealId: null,
  contact: { firstName: "Анна", lastName: "Иванова" },
  company: null,
  deal: null,
  updatedAt: new Date().toISOString(),
  canWrite: true,
};
const realFetch = window.fetch.bind(window);
window.fetch = async (resource, init) => {
  const url = new URL(String(resource), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return realFetch(resource, init);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const json = (v: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } }));
  if (url.pathname === "/api/quotations/options")
    return json({
      options:
        url.searchParams.get("type") === "company"
          ? [{ id: "company-1", label: "Client Ltd" }]
          : [{ id: "contact-1", label: "Анна Иванова" }],
    });
  if (url.pathname === "/api/deals") return json({ deals: [{ id: "deal-1", title: "CRM consulting" }] });
  if (url.pathname === "/api/contracts") {
    if (init?.method === "POST")
      return json({ ...row, ...body, id: "fixture-new", status: "DRAFT", canWrite: true }, 201);
    const search = url.searchParams.get("search")?.toLowerCase(),
      status = url.searchParams.get("status");
    const rows =
      (!search || row.title.toLowerCase().includes(search) || row.number.toLowerCase().includes(search)) &&
      (!status || status === row.status)
        ? [row]
        : [];
    return json({ contracts: rows, total: rows.length, totalPages: rows.length });
  }
  if (url.pathname === "/api/contracts/fixture-1") {
    if (init?.method === "PATCH") {
      try {
        if (body.status !== undefined || body.signedByClient !== undefined || body.signedByUs !== undefined)
          Object.assign(
            row,
            nextContractState(
              {
                ...row,
                startDate: row.startDate ? new Date(row.startDate) : null,
                endDate: row.endDate ? new Date(row.endDate) : null,
              },
              contractStateSchema.parse(body),
            ),
          );
        else Object.assign(row, body);
        row.updatedAt = new Date(new Date(row.updatedAt).getTime() + 1).toISOString();
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : "Invalid change" }, 409);
      }
    }
    return json(row);
  }
  return json({ error: "Fixture endpoint unavailable" }, 404);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function App() {
  const [mode, setMode] = useState("detail"),
    [sheet, setSheet] = useState(false);
  return (
    <AppRouterContext.Provider
      value={{
        bfcacheId: "fixture",
        back: () => setMode("list"),
        forward: () => undefined,
        refresh: () => undefined,
        prefetch: () => undefined,
        push: () => setMode("detail"),
        replace: () => setMode("detail"),
      }}
    >
      <QueryClientProvider client={client}>
        <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
          <p className="text-muted-foreground text-xs">Local fixture only — no database, email or legal signature.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setMode("detail")}>
              Detail fixture
            </Button>
            <Button variant="outline" onClick={() => setMode("list")}>
              List fixture
            </Button>
            <Button variant="outline" onClick={() => setSheet(true)}>
              Create fixture
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                row.canWrite = !row.canWrite;
                void client.invalidateQueries();
              }}
            >
              Toggle viewer
            </Button>
          </div>
          {mode === "detail" ? (
            <ContractDetail workspaceId="fixture" id="fixture-1" />
          ) : (
            <ContractsList workspaceId="fixture" canWrite={row.canWrite} defaultCurrency="EUR" />
          )}
          {sheet && (
            <ContractFormSheet
              open
              onOpenChange={setSheet}
              workspaceId="fixture"
              defaultCurrency="EUR"
              onSaved={() => undefined}
            />
          )}
        </main>
      </QueryClientProvider>
    </AppRouterContext.Provider>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(<App />);
