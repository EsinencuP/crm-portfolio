"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Columns3, List, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { KanbanDeal } from "./_components/deal-card";
import { DealFormSheet } from "./_components/deal-form-sheet";
import { DealsKanban, fetchDeals } from "./_components/deals-kanban";
import { DealsTable } from "./_components/deals-table";
import type { PipelineStage } from "./_components/pipeline-column";
import DealsLoading from "./loading";

type View = "kanban" | "table";
const viewKey = "crm-deals-view";

function amounts(deals: KanbanDeal[], weighted = false) {
  const cents = new Map<string, number>();
  for (const deal of deals) {
    if (deal.value === null) continue;
    const factor = weighted ? Math.max(0, Math.min(100, deal.stage.probability)) / 100 : 1;
    cents.set(deal.currency, (cents.get(deal.currency) ?? 0) + Math.round(Number(deal.value) * factor * 100));
  }
  if (cents.size === 0) return "—";
  return [...cents]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, value]) => {
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
          value / 100,
        );
      } catch {
        return `${(value / 100).toFixed(2)} ${currency}`;
      }
    })
    .join(" · ");
}

export default function DealsPage() {
  const [view, setView] = useState<View>("kanban");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KanbanDeal | undefined>();
  useEffect(() => {
    const saved = localStorage.getItem(viewKey);
    if (saved === "kanban" || saved === "table") setView(saved);
  }, []);
  function selectView(next: View) {
    setView(next);
    localStorage.setItem(viewKey, next);
  }
  const editDeal = useCallback((deal: KanbanDeal) => {
    setEditing(deal);
    setFormOpen(true);
  }, []);
  const dealsQuery = useQuery({
    queryKey: ["deals", "kanban"],
    queryFn: ({ signal }) => fetchDeals(signal),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const stagesQuery = useQuery({
    queryKey: ["pipeline-stages"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/pipeline-stages", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load pipeline stages.");
      return response.json() as Promise<{ stages: PipelineStage[] }>;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const deals = dealsQuery.data ?? [];
  const stages = stagesQuery.data?.stages ?? [];
  const summary = useMemo(() => {
    const now = new Date();
    const thisMonth = deals.filter((deal) => {
      if (!deal.closeDate) return false;
      const date = new Date(deal.closeDate);
      return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
    });
    const won = thisMonth.filter((deal) => deal.stage.name.toLowerCase() === "closed won");
    const lost = thisMonth.filter((deal) => deal.stage.name.toLowerCase() === "closed lost");
    const active = deals.filter((deal) => !["closed won", "closed lost"].includes(deal.stage.name.toLowerCase()));
    return {
      total: amounts(deals),
      forecast: amounts(active, true),
      won: amounts(won),
      lost: amounts(lost),
      wonCount: won.length,
      lostCount: lost.length,
    };
  }, [deals]);

  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Deals</h1>
          <p className="text-muted-foreground">Manage your pipeline and track revenue.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
          disabled={stages.length === 0}
        >
          <Plus className="size-4" /> Add Deal
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { title: "Total value", value: summary.total, description: `${deals.length} deals across all stages` },
          { title: "Weighted forecast", value: summary.forecast, description: "Open deals × stage probability" },
          { title: "Won this month", value: summary.won, description: `${summary.wonCount} deals by close date` },
          { title: "Lost this month", value: summary.lost, description: `${summary.lostCount} deals by close date` },
        ].map((item) => (
          <Card key={item.title} className="min-w-0 gap-2">
            <CardHeader>
              <CardTitle className="font-medium text-muted-foreground text-sm">{item.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="break-words font-semibold text-xl tabular-nums">
                {dealsQuery.isLoading ? "…" : item.value}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">{item.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Pipeline</h2>
          <p className="text-muted-foreground text-sm">Browse deals as a board or table.</p>
        </div>
        <fieldset aria-label="Deals view" className="inline-flex rounded-lg border p-1">
          <Button
            size="sm"
            variant={view === "kanban" ? "secondary" : "ghost"}
            aria-pressed={view === "kanban"}
            onClick={() => selectView("kanban")}
          >
            <Columns3 className="size-4" /> Kanban
          </Button>
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            aria-pressed={view === "table"}
            onClick={() => selectView("table")}
          >
            <List className="size-4" /> Table
          </Button>
        </fieldset>
      </div>
      {(dealsQuery.isError || stagesQuery.isError) && (
        <div role="alert" className="rounded-lg border border-destructive/40 p-4 text-destructive">
          {dealsQuery.error?.message ?? stagesQuery.error?.message ?? "Unable to load deals."}
          <Button
            variant="outline"
            size="sm"
            className="ml-3"
            onClick={() => {
              void dealsQuery.refetch();
              void stagesQuery.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {(dealsQuery.isLoading || stagesQuery.isLoading) && <DealsLoading />}
      {!dealsQuery.isLoading &&
        !stagesQuery.isLoading &&
        !dealsQuery.isError &&
        !stagesQuery.isError &&
        deals.length === 0 && (
          <EmptyState
            icon={BriefcaseBusiness}
            title="No deals yet"
            description="Add a deal to start tracking your pipeline and forecast."
            action={
              stages.length
                ? { label: "Add Deal", onClick: () => setFormOpen(true) }
                : { label: "Configure pipeline", href: "/dashboard/settings/pipeline" }
            }
          />
        )}
      {view === "kanban" && !dealsQuery.isLoading && !stagesQuery.isLoading && deals.length > 0 && <DealsKanban />}
      {view === "table" && !dealsQuery.isLoading && !stagesQuery.isLoading && deals.length > 0 && (
        <DealsTable deals={deals} stages={stages} onEdit={editDeal} />
      )}
      <DealFormSheet open={formOpen} onOpenChange={setFormOpen} deal={editing} stages={stages} />
    </div>
  );
}
