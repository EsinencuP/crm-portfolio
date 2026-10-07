import "server-only";

import { connection } from "next/server";

import { Prisma } from "@prisma/client";

import { getAccessibleEntityIds } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { PipelineFunnel, type PipelineFunnelDatum } from "./pipeline-funnel";

export async function PipelineFunnelWrapper() {
  await connection();
  const member = await requireActiveWorkspaceMember();
  const dealIds = await getAccessibleEntityIds(member.userId, "Deal", member.workspaceId);

  const stagesQuery = prisma.pipelineStage.findMany({
    where: { workspaceId: member.workspaceId },
    select: { id: true, name: true, color: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });
  const totalsQuery = prisma.deal.groupBy({
    where: { workspaceId: member.workspaceId, id: { in: dealIds } },
    by: ["stageId"],
    _count: { _all: true },
    _sum: { value: true },
  });
  const currencyTotalsQuery = prisma.deal.groupBy({
    where: { workspaceId: member.workspaceId, id: { in: dealIds } },
    by: ["stageId", "currency"],
    _sum: { value: true },
    orderBy: { currency: "asc" },
  });
  const [stages, totals, currencyTotals] = await prisma.$transaction([stagesQuery, totalsQuery, currencyTotalsQuery], {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  });

  const totalsByStage = new Map(totals.map((total) => [total.stageId, total]));
  const valuesByStage = new Map<string, NonNullable<PipelineFunnelDatum["valueByCurrency"]>>();

  for (const total of currencyTotals) {
    const values = valuesByStage.get(total.stageId) ?? [];
    values.push({ currency: total.currency, value: total._sum.value?.toNumber() ?? 0 });
    valuesByStage.set(total.stageId, values);
  }

  const data: PipelineFunnelDatum[] = stages.map((stage) => {
    const total = totalsByStage.get(stage.id);

    return {
      id: stage.id,
      stage: stage.name,
      count: total?._count._all ?? 0,
      // A nominal sum for the base props; the tooltip uses currency totals without conversion.
      value: total?._sum.value?.toNumber() ?? 0,
      color: stage.color,
      valueByCurrency: valuesByStage.get(stage.id) ?? [],
    };
  });

  return <PipelineFunnel data={data} />;
}
