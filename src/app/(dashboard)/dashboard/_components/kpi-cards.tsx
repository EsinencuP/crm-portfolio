import "server-only";

import { connection } from "next/server";

import { Prisma } from "@prisma/client";
import { BriefcaseBusiness, Minus, Percent, TrendingDown, TrendingUp, Trophy, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

type Trend = {
  label: string;
  direction: "up" | "down" | "flat";
  explanation?: string;
};

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const countFormatter = new Intl.NumberFormat("en-US");
const trendStyles = {
  up: {
    icon: TrendingUp,
    sign: "+",
    className:
      "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300",
  },
  down: {
    icon: TrendingDown,
    sign: "−",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  flat: { icon: Minus, sign: "", className: "border-border bg-muted/50 text-muted-foreground" },
};

function formatChange(change: number, unit: "%" | " pp"): Trend {
  let direction: Trend["direction"] = "flat";
  if (change > 0) direction = "up";
  if (change < 0) direction = "down";
  const magnitude = Math.abs(change);
  const value = magnitude > 0 && magnitude < 0.05 ? "<0.1" : numberFormatter.format(magnitude);
  const { sign } = trendStyles[direction];

  return { label: `${sign}${value}${unit}`, direction };
}

function countTrend(current: number, previous: number): Trend {
  if (previous === 0 && current > 0) {
    return { label: "New", direction: "up", explanation: "No previous-month baseline for a percentage change" };
  }

  return formatChange(previous === 0 ? 0 : ((current - previous) / previous) * 100, "%");
}

function conversion(won: number, total: number) {
  return total === 0 ? 0 : (won / total) * 100;
}

function formatPipelineValue(currency: string, amount: Prisma.Decimal | null) {
  const value = amount?.toNumber() ?? 0;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.trim().toUpperCase(),
      currencyDisplay: "code",
    }).format(value);
  } catch {
    // Currency is a free-form field in the schema. Keep an invalid code visible.
    return `${currency || "Unspecified currency"} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  }
}

function TrendBadge({ trend }: { trend: Trend }) {
  const { icon: Icon, className } = trendStyles[trend.direction];

  return (
    <Badge variant="outline" title={trend.explanation} className={className}>
      <Icon aria-hidden="true" />
      {trend.label}
    </Badge>
  );
}

export async function KpiCards() {
  // These totals and the current month must be evaluated at request time.
  await connection();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const thisMonth = { gte: monthStart, lte: now };
  const lastMonth = { gte: previousMonthStart, lt: monthStart };
  const wonStage: Prisma.DealWhereInput = { stage: { name: { equals: "Closed Won", mode: "insensitive" } } };
  const activeStage: Prisma.DealWhereInput = {
    NOT: [wonStage, { stage: { name: { equals: "Closed Lost", mode: "insensitive" } } }],
  };

  // Use one consistent database snapshot for numerators, denominators and totals.
  const [
    totalContacts,
    newContacts,
    previousNewContacts,
    activeDeals,
    activeValues,
    newActiveDeals,
    previousNewActiveDeals,
    wonThisMonth,
    wonLastMonth,
    totalDeals,
    wonDeals,
    newDeals,
    previousNewDeals,
    newWonDeals,
    previousNewWonDeals,
  ] = await prisma.$transaction(
    [
      prisma.contact.count(),
      prisma.contact.count({ where: { createdAt: thisMonth } }),
      prisma.contact.count({ where: { createdAt: lastMonth } }),
      prisma.deal.count({ where: activeStage }),
      prisma.deal.groupBy({
        by: ["currency"],
        where: activeStage,
        _sum: { value: true },
        orderBy: { currency: "asc" },
      }),
      prisma.deal.count({ where: { ...activeStage, createdAt: thisMonth } }),
      prisma.deal.count({ where: { ...activeStage, createdAt: lastMonth } }),
      // closeDate is the only closing date available; undated wins stay in the all-time total.
      prisma.deal.count({ where: { ...wonStage, closeDate: thisMonth } }),
      prisma.deal.count({ where: { ...wonStage, closeDate: lastMonth } }),
      prisma.deal.count(),
      prisma.deal.count({ where: wonStage }),
      prisma.deal.count({ where: { createdAt: thisMonth } }),
      prisma.deal.count({ where: { createdAt: lastMonth } }),
      prisma.deal.count({ where: { ...wonStage, createdAt: thisMonth } }),
      prisma.deal.count({ where: { ...wonStage, createdAt: lastMonth } }),
    ],
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );

  // There is no stage history: compare creation cohorts, not historical pipeline snapshots.
  const currentConversion = conversion(newWonDeals, newDeals);
  const previousConversion = conversion(previousNewWonDeals, previousNewDeals);
  const conversionTrend: Trend =
    newDeals > 0 && previousNewDeals > 0
      ? formatChange(currentConversion - previousConversion, " pp")
      : { label: "No comparison data", direction: "flat", explanation: "Both months need deals to compare conversion" };

  const cards = [
    {
      title: "Total Contacts",
      icon: Users,
      value: countFormatter.format(totalContacts),
      detail: "All contacts",
      trend: countTrend(newContacts, previousNewContacts),
      comparison: "New contacts vs last month",
      comparisonDetail: `${countFormatter.format(newContacts)} this month · ${countFormatter.format(previousNewContacts)} last month`,
    },
    {
      title: "Active Deals",
      icon: BriefcaseBusiness,
      value: countFormatter.format(activeDeals),
      detail: `Pipeline value: ${activeValues.map(({ currency, _sum }) => formatPipelineValue(currency, _sum?.value ?? null)).join(" · ") || "0"}`,
      trend: countTrend(newActiveDeals, previousNewActiveDeals),
      comparison: "New active deals vs last month",
      comparisonDetail: `${countFormatter.format(newActiveDeals)} this month · ${countFormatter.format(previousNewActiveDeals)} last month`,
    },
    {
      title: "Won This Month",
      icon: Trophy,
      value: countFormatter.format(wonThisMonth),
      detail: "Closed Won · by close date",
      trend: countTrend(wonThisMonth, wonLastMonth),
      comparison: "From last month",
      comparisonDetail: `${countFormatter.format(wonLastMonth)} won last month`,
    },
    {
      title: "Conversion Rate",
      icon: Percent,
      value: `${numberFormatter.format(conversion(wonDeals, totalDeals))}%`,
      detail: `${countFormatter.format(wonDeals)} won / ${countFormatter.format(totalDeals)} total deals`,
      trend: conversionTrend,
      comparison: "New-deal conversion vs last month",
      comparisonDetail:
        newDeals > 0 && previousNewDeals > 0
          ? `${numberFormatter.format(currentConversion)}% this month · ${numberFormatter.format(previousConversion)}% last month`
          : "No deals in one or both monthly groups",
    },
  ];

  return (
    <section aria-label="Key performance indicators" className="space-y-3">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ title, icon: Icon, value, detail, trend, comparison, comparisonDetail }) => (
          <Card key={title} className="min-w-0">
            <CardHeader>
              <CardDescription>
                <h2>{title}</h2>
              </CardDescription>
              <CardAction className="grid size-8 place-items-center rounded-md bg-muted">
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <p className="wrap-anywhere font-bold text-3xl tabular-nums leading-none tracking-tight">{value}</p>
              <p className="wrap-anywhere text-muted-foreground text-sm">{detail}</p>
              <div className="mt-auto space-y-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <TrendBadge trend={trend} />
                  <span className="text-muted-foreground text-xs">{comparison}</span>
                </div>
                <p className="text-muted-foreground text-xs tabular-nums">{comparisonDetail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Month to date vs previous full month · UTC. New-deal comparisons use current stages of deals created each month.
      </p>
    </section>
  );
}
