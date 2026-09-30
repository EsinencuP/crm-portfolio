import { requireRole } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

import { PipelineSettings } from "./_components/pipeline-settings";

export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  await requireRole(["ADMIN", "MANAGER"]);
  const stages = await prisma.pipelineStage.findMany({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { _count: { select: { deals: true } } },
  });
  return <PipelineSettings initialStages={stages} />;
}
