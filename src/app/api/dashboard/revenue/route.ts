import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { REVENUE_PERIODS, type RevenueChartData, type RevenueMonth, type RevenuePeriod } from "@/lib/revenue-types";

export const runtime = "nodejs";

const querySchema = z.object({
  period: z.enum(REVENUE_PERIODS).default("12m"),
  currency: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((value) => value.toUpperCase())
    .optional(),
});
const headers = { "Cache-Control": "private, no-store" };
const closedStage: Prisma.DealWhereInput = {
  OR: [
    { stage: { name: { equals: "Closed Won", mode: "insensitive" } } },
    { stage: { name: { equals: "Closed Lost", mode: "insensitive" } } },
  ],
};

function periodStart(period: RevenuePeriod, now: Date) {
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (period === "12m" ? 11 : 5), 1));
}

type MonthlyTotal = { month: string; won: Prisma.Decimal; lost: Prisma.Decimal; closedDeals: number };

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) return Response.json({ error: "Please sign in to view revenue." }, { status: 401, headers });

    const params = new URL(request.url).searchParams;
    const query = querySchema.safeParse({
      period: params.get("period") ?? undefined,
      currency: params.get("currency") ?? undefined,
    });
    if (!query.success)
      return Response.json({ error: "Invalid revenue period or currency." }, { status: 400, headers });

    const now = new Date();
    const from = periodStart(query.data.period, now);
    const yearStart = periodStart("12m", now);
    const { currency, currencies, totals } = await prisma.$transaction(
      async (transaction) => {
        const groups = await transaction.deal.groupBy({
          by: ["currency"],
          where: { ...closedStage, closeDate: { gte: yearStart, lte: now } },
        });
        const available = [
          ...new Set(groups.map(({ currency: code }) => code.trim().toUpperCase() || "UNKNOWN")),
        ].sort();
        const currency = query.data.currency ?? (available.includes("USD") ? "USD" : (available[0] ?? "USD"));
        const currencies = [...new Set([...available, currency])].sort();

        // PostgreSQL groups dates without loading individual deals into the browser.
        // DateTime columns store UTC timestamps; all values below are bound parameters.
        const totals = await transaction.$queryRaw<MonthlyTotal[]>`
          SELECT
            TO_CHAR(DATE_TRUNC('month', d."closeDate"), 'YYYY-MM') AS "month",
            SUM(CASE WHEN LOWER(s."name") = 'closed won' THEN COALESCE(d."value", 0) ELSE 0 END) AS "won",
            SUM(CASE WHEN LOWER(s."name") = 'closed lost' THEN COALESCE(d."value", 0) ELSE 0 END) AS "lost",
            COUNT(*)::integer AS "closedDeals"
          FROM "Deal" d
          JOIN "PipelineStage" s ON s."id" = d."stageId"
          WHERE LOWER(s."name") IN ('closed won', 'closed lost')
            AND d."closeDate" >= (${from}::timestamptz AT TIME ZONE 'UTC')
            AND d."closeDate" <= (${now}::timestamptz AT TIME ZONE 'UTC')
            AND COALESCE(NULLIF(UPPER(BTRIM(d."currency")), ''), 'UNKNOWN') = ${currency}
          GROUP BY DATE_TRUNC('month', d."closeDate")
          ORDER BY DATE_TRUNC('month', d."closeDate")
        `;

        return { currency, currencies, totals };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    const byMonth = new Map(totals.map((total) => [total.month, total]));
    const data: RevenueMonth[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    while (cursor <= lastMonth) {
      const month = cursor.toISOString().slice(0, 7);
      const total = byMonth.get(month);
      data.push({
        month,
        won: total?.won.toNumber() ?? 0,
        lost: total?.lost.toNumber() ?? 0,
        closedDeals: total?.closedDeals ?? 0,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return Response.json(
      {
        period: query.data.period,
        currency,
        currencies,
        from: from.toISOString(),
        to: now.toISOString(),
        data,
      } satisfies RevenueChartData,
      { headers },
    );
  } catch {
    return Response.json({ error: "Revenue is unavailable. Please try again." }, { status: 500, headers });
  }
}
