import { z } from "zod";

import { getCurrentUser } from "@/lib/auth-utils";
import { getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const querySchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401 });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409 });
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    from: params.get("from"),
    to: params.get("to"),
    currency: params.get("currency") ?? undefined,
  });
  if (!parsed.success) return Response.json({ error: "Invalid date range or currency." }, { status: 400 });
  const { from, to, currency } = parsed.data;
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T23:59:59.999Z`);
  if (start > end || end.getTime() - start.getTime() > 1000 * 60 * 60 * 24 * 730)
    return Response.json({ error: "Select a range of up to two years." }, { status: 400 });
  try {
    const dealIds = await getAccessibleEntityIds(user.id, "Deal", member.workspaceId);
    const [stages, createdDeals, closedDeals, currencyRows] = await Promise.all([
      prisma.pipelineStage.findMany({
        where: { workspaceId: member.workspaceId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      }),
      prisma.deal.findMany({
        where: { workspaceId: member.workspaceId, id: { in: dealIds }, currency, createdAt: { gte: start, lte: end } },
        select: {
          id: true,
          title: true,
          value: true,
          stageId: true,
          createdAt: true,
          contact: { select: { source: true } },
        },
      }),
      prisma.deal.findMany({
        where: {
          workspaceId: member.workspaceId,
          id: { in: dealIds },
          currency,
          closeDate: { gte: start, lte: end },
          stage: { name: { in: ["Closed Won", "Closed Lost"], mode: "insensitive" } },
        },
        select: {
          id: true,
          value: true,
          closeDate: true,
          createdAt: true,
          stage: { select: { name: true } },
          owner: { select: { id: true, name: true } },
        },
      }),
      prisma.deal.findMany({
        where: { workspaceId: member.workspaceId, id: { in: dealIds } },
        distinct: ["currency"],
        select: { currency: true },
      }),
    ]);
    const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
    const pipeline = stages.map((stage) => ({
      stage: stage.name,
      color: stage.color,
      count: createdDeals.filter((deal) => deal.stageId === stage.id).length,
    }));
    const sourceMap = new Map<string, { source: string; won: number; lost: number; open: number }>();
    for (const deal of createdDeals) {
      const source = deal.contact?.source ?? "UNKNOWN";
      const entry = sourceMap.get(source) ?? { source, won: 0, lost: 0, open: 0 };
      const stage = stageMap.get(deal.stageId)?.name.toLowerCase();
      if (stage === "closed won") entry.won++;
      else if (stage === "closed lost") entry.lost++;
      else entry.open++;
      sourceMap.set(source, entry);
    }
    const won = closedDeals.filter((deal) => deal.stage.name.toLowerCase() === "closed won");
    const lost = closedDeals.filter((deal) => deal.stage.name.toLowerCase() === "closed lost");
    const performerMap = new Map<string, { name: string; amount: number }>();
    for (const deal of won) {
      const key = deal.owner?.id ?? "unassigned";
      const item = performerMap.get(key) ?? { name: deal.owner?.name ?? "Unassigned", amount: 0 };
      item.amount += Number(deal.value ?? 0);
      performerMap.set(key, item);
    }
    const months: { key: string; label: string; revenue: number; cycleTotal: number; cycleCount: number }[] = [];
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= end) {
      months.push({
        key: cursor.toISOString().slice(0, 7),
        label: cursor.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }),
        revenue: 0,
        cycleTotal: 0,
        cycleCount: 0,
      });
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    const byMonth = new Map(months.map((month) => [month.key, month]));
    for (const deal of won) {
      if (!deal.closeDate) continue;
      const bucket = byMonth.get(deal.closeDate.toISOString().slice(0, 7));
      if (!bucket) continue;
      bucket.revenue += Number(deal.value ?? 0);
      const days = (deal.closeDate.getTime() - deal.createdAt.getTime()) / 86_400_000;
      if (days >= 0) {
        bucket.cycleTotal += days;
        bucket.cycleCount++;
      }
    }
    return Response.json(
      {
        currency,
        currencies: [...new Set([currency, ...currencyRows.map((row) => row.currency)])].sort(),
        from,
        to,
        revenue: months.map(({ label, revenue }) => ({ period: label, value: Math.round(revenue * 100) / 100 })),
        pipeline,
        winLoss: [
          { name: "Won", value: won.length },
          { name: "Lost", value: lost.length },
        ],
        bySource: [...sourceMap.values()].sort((a, b) => a.source.localeCompare(b.source)),
        performers: [...performerMap.values()]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 10)
          .map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 })),
        cycleTime: months.map(({ label, cycleTotal, cycleCount }) => ({
          period: label,
          days: cycleCount ? Math.round((cycleTotal / cycleCount) * 10) / 10 : null,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json({ error: "Unable to load analytics." }, { status: 500 });
  }
}
