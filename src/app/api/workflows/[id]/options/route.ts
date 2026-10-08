import prisma from "@/lib/prisma";
import { workflowActor, workflowHeaders, workflowWhere } from "@/lib/workflows/access";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await workflowActor();
  if (actor.error) return actor.error;
  const { id } = await params;
  const workflow = await prisma.workflow.findFirst({
    where: { ...workflowWhere(actor.member), id },
    select: { createdById: true },
  });
  if (!workflow) return Response.json({ error: "Workflow not found." }, { status: 404, headers: workflowHeaders });
  const workspaceId = actor.member.workspaceId;
  const [members, stages, tags, accounts] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, role: { not: "VIEWER" } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.pipelineStage.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { position: "asc" },
    }),
    prisma.tag.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.emailAccount.findMany({
      where: { workspaceId, userId: workflow.createdById },
      select: { id: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return Response.json(
    { users: members.map((member) => member.user), stages, tags, accounts },
    { headers: workflowHeaders },
  );
}
