"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { format, subMonths } from "date-fns";
import { BarChart3 } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { DateRangePicker } from "@/components/date-range-picker";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { DealCycleTime } from "./_components/deal-cycle-time";
import { DealsBySource } from "./_components/deals-by-source";
import { PipelineFunnelChart } from "./_components/pipeline-funnel-chart";
import { RevenueOverTime } from "./_components/revenue-over-time";
import { TopPerformers } from "./_components/top-performers";
import { WinLossRatio } from "./_components/win-loss-ratio";
import AnalyticsLoading from "./loading";

type Analytics = {
  currency: string;
  currencies: string[];
  revenue: { period: string; value: number }[];
  pipeline: { stage: string; color: string; count: number }[];
  winLoss: { name: string; value: number }[];
  bySource: { source: string; won: number; lost: number; open: number }[];
  performers: { name: string; amount: number }[];
  cycleTime: { period: string; days: number | null }[];
};

export default function AnalyticsPage() {
  const [range, setRange] = useState<DateRange | undefined>(() => ({
    from: subMonths(new Date(), 11),
    to: new Date(),
  }));
  const [currency, setCurrency] = useState("USD");
  const from = range?.from ? format(range.from, "yyyy-MM-dd") : "";
  const to = range?.to ? format(range.to, "yyyy-MM-dd") : "";
  const query = useQuery({
    queryKey: ["analytics", from, to, currency],
    enabled: Boolean(from && to),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from, to, currency });
      const response = await fetch(`/api/analytics?${params}`, { signal, cache: "no-store" });
      const body: Analytics & { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load analytics.");
      return body;
    },
  });
  const data = query.data;
  let chartContent: React.ReactNode = null;
  if (!from || !to) {
    chartContent = (
      <p className="rounded-lg border p-8 text-center text-muted-foreground">Select a start and end date.</p>
    );
  } else if (query.isLoading) {
    chartContent = <AnalyticsLoading />;
  } else if (query.isError) {
    chartContent = (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-4 text-destructive"
      >
        <span>{query.error.message}</span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (data?.pipeline.every((stage) => stage.count === 0)) {
    chartContent = (
      <EmptyState
        icon={BarChart3}
        title="No analytics for this period"
        description="Add deals or choose another date range to see your reports."
        action={{ label: "View deals", href: "/dashboard/deals" }}
      />
    );
  } else if (data) {
    chartContent = (
      <div className="grid min-w-0 gap-4 md:grid-cols-2 md:gap-6">
        <RevenueOverTime data={data.revenue} currency={currency} />
        <PipelineFunnelChart data={data.pipeline} />
        <WinLossRatio data={data.winLoss} />
        <DealsBySource data={data.bySource} />
        <TopPerformers data={data.performers} currency={currency} />
        <DealCycleTime data={data.cycleTime} />
      </div>
    );
  }
  return (
    <div className="min-w-0 space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-2xl tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Pipeline performance and closed deal trends.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Select value={currency} onValueChange={(value) => setCurrency(value ?? "USD")}>
            <SelectTrigger className="w-24" aria-label="Currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(data?.currencies ?? [currency]).map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Pipeline and source charts use deal creation dates. Revenue, win/loss and performers use planned close dates.
        Values are shown in {currency} only.
      </p>
      {chartContent}
    </div>
  );
}
