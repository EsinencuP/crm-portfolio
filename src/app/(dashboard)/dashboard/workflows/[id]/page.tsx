import { forbidden, notFound } from "next/navigation";

import prisma from "@/lib/prisma";
import { workflowWhere } from "@/lib/workflows/access";
import type { EditorWorkflow } from "@/lib/workflows/editor";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { WorkflowCanvas } from "./_components/workflow-canvas";

export default async function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role)) forbidden();
  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { ...workflowWhere(member), id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!workflow) notFound();
  const initialWorkflow: EditorWorkflow = JSON.parse(JSON.stringify(workflow));
  return (
    <WorkflowCanvas
      key={`${member.workspaceId}:${id}`}
      initialWorkflow={initialWorkflow}
      workspaceId={member.workspaceId}
    />
  );
}
