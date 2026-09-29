"use client";

import { useId, useState } from "react";

import Link from "next/link";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REVENUE_PERIODS, type RevenueChartData, type RevenuePeriod } from "@/lib/revenue-types";

const periodLabels: Record<RevenuePeriod, string> = { "12m": "12 months", "6m": "6 months", "30d": "30 days" };
const chartConfig = {
  won: { label: "Won", color: "var(--revenue-won)" },
  lost: { label: "Lost", color: "var(--revenue-lost)" },
} satisfies ChartConfig;
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const tooltipDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const axisFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

function monthDate(month: string) {
  return new Date(`${month}-01T00:00:00Z`);
}

function formatValue(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: currency === "USD" ? "symbol" : "code",
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
  }
}

async function fetchRevenue(period: RevenuePeriod, currency: string | undefined, signal: AbortSignal) {
  const params = new URLSearchParams({ period });
  if (currency !== undefined) params.set("currency", currency);
  const response = await fetch(`/api/dashboard/revenue?${params}`, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : "Revenue is unavailable. Please try again.",
    );
  }
  return (await response.json()) as RevenueChartData;
}

export function RevenueChart() {
  const { data: session, status } = useSession();
  const [period, setPeriod] = useState<RevenuePeriod>("12m");
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const id = useId().replace(/:/g, "");
  const query = useQuery({
    queryKey: ["dashboard-revenue", session?.user.id, period, currency],
    queryFn: ({ signal }) => fetchRevenue(period, currency, signal),
    enabled: status === "authenticated",
    retry: false,
    staleTime: 0,
  });
  const data = query.data;
  const selectedCurrency = currency ?? data?.currency ?? "USD";
  const currencies = [...new Set([...(data?.currencies ?? []), selectedCurrency])].sort();

  return (
    <Card
      role="region"
      aria-label="Revenue Overview"
      className="@container/card min-w-0 [--revenue-lost:#dc2626] [--revenue-won:#16a34a] dark:[--revenue-lost:#f87171] dark:[--revenue-won:#4ade80]"
    >
      <Tabs
        value={period}
        onValueChange={(value) => {
          if (REVENUE_PERIODS.includes(value as RevenuePeriod)) setPeriod(value as RevenuePeriod);
        }}
        className="gap-4"
      >
        <CardHeader className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>
              <h2>Revenue Overview</h2>
            </CardTitle>
            <CardDescription>Won and Lost deal values, grouped by month.</CardDescription>
          </div>
          <CardAction className="flex @[640px]/card:w-auto w-full flex-wrap items-center gap-2">
            <TabsList aria-label="Revenue period">
              {REVENUE_PERIODS.map((value) => (
                <TabsTrigger key={value} value={value} className="px-2 text-xs sm:text-sm">
                  {periodLabels[value]}
                </TabsTrigger>
              ))}
            </TabsList>
            <Select
              value={selectedCurrency}
              items={currencies.map((value) => ({ value, label: value }))}
              onValueChange={(value) => {
                if (value) setCurrency(value);
              }}
              disabled={status !== "authenticated" || query.isPending}
            >
              <SelectTrigger aria-label="Revenue currency" className="w-24" size="sm">
                <SelectValue className="truncate" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <TabsContent value={period} aria-label={`${periodLabels[period]} revenue in ${selectedCurrency}`}>
            {status === "unauthenticated" && (
              <div className="grid h-62 content-center justify-items-center gap-3 text-center">
                <p className="text-muted-foreground text-sm">Sign in to view revenue.</p>
                <Button variant="outline" render={<Link href="/login" />}>
                  Sign in
                </Button>
              </div>
            )}
            {status === "authenticated" && query.isError && (
              <div role="alert" className="grid h-62 content-center justify-items-center gap-3 text-center">
                <p className="text-destructive text-sm">{query.error.message}</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Retry
                </Button>
              </div>
            )}
            {status !== "unauthenticated" && !query.isError && !data && (
              <div role="status" aria-label="Loading revenue" className="h-62">
                <Skeleton className="h-full w-full" />
              </div>
            )}
            {status === "authenticated" && !query.isError && data && (
              <>
                {data.data.every((month) => month.closedDeals === 0) && (
                  <p className="mb-3 text-muted-foreground text-sm">No closed deals in this period.</p>
                )}
                <ChartContainer config={chartConfig} className="aspect-auto h-62 w-full">
                  <AreaChart
                    accessibilityLayer
                    aria-label={`Monthly Won and Lost deal values in ${data.currency}`}
                    data={data.data}
                    margin={{ left: 0, right: 12, top: 8, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id={`${id}-won`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-won)" stopOpacity={1} />
                        <stop offset="95%" stopColor="var(--color-won)" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id={`${id}-lost`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-lost)" stopOpacity={1} />
                        <stop offset="95%" stopColor="var(--color-lost)" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={24}
                      tickFormatter={(value: string) => monthFormatter.format(monthDate(value))}
                    />
                    <YAxis
                      width={44}
                      tickLine={false}
                      axisLine={false}
                      domain={[(minimum: number) => Math.min(0, minimum), (maximum: number) => Math.max(1, maximum)]}
                      tickFormatter={(value: number) => axisFormatter.format(value)}
                    />
                    <ChartTooltip
                      cursor={false}
                      wrapperStyle={{ maxWidth: "100%" }}
                      content={
                        <ChartTooltipContent
                          className="max-w-72"
                          labelFormatter={(_label, payload) =>
                            tooltipDateFormatter.format(monthDate(payload[0].payload.month))
                          }
                          formatter={(value, name, item) => (
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="size-2.5 shrink-0 rounded-xs"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-muted-foreground">{name}</span>
                              <span className="wrap-anywhere ml-auto font-medium tabular-nums">
                                {formatValue(Number(value), data.currency)}
                              </span>
                            </div>
                          )}
                        />
                      }
                    />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area
                      dataKey="won"
                      name="Won"
                      type="monotone"
                      fill={`url(#${id}-won)`}
                      fillOpacity={0.3}
                      stroke="var(--color-won)"
                      strokeWidth={2}
                      dot={data.data.length === 1 ? { r: 3 } : false}
                    />
                    <Area
                      dataKey="lost"
                      name="Lost"
                      type="monotone"
                      fill={`url(#${id}-lost)`}
                      fillOpacity={0.1}
                      stroke="var(--color-lost)"
                      strokeWidth={2}
                      dot={data.data.length === 1 ? { r: 3 } : false}
                    />
                  </AreaChart>
                </ChartContainer>
                <div className="sr-only">
                  <table>
                    <caption>Monthly revenue in {data.currency}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Won</th>
                        <th scope="col">Lost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.data.map((month) => (
                        <tr key={month.month}>
                          <th scope="row">{tooltipDateFormatter.format(monthDate(month.month))}</th>
                          <td>{formatValue(month.won, data.currency)}</td>
                          <td>{formatValue(month.lost, data.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </TabsContent>
          <p className="text-muted-foreground text-xs">
            By close date · UTC. Lost shows lost deal value. Current month is partial.
          </p>
        </CardContent>
      </Tabs>
    </Card>
  );
}
