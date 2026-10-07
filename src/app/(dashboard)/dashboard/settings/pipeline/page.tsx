import { forbidden } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { PipelineSettings } from "./_components/pipeline-settings";

export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  const member = await requireActiveWorkspaceMember();
  if (member.role !== "OWNER" && member.role !== "ADMIN" && member.role !== "MANAGER") forbidden();
  const stages = await prisma.pipelineStage.findMany({
    where: { workspaceId: member.workspaceId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { _count: { select: { deals: true } } },
  });
  return <PipelineSettings initialStages={stages} />;
}
