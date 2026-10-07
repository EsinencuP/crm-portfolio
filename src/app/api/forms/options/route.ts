import { formActor, formHeaders } from "@/lib/forms/access";
import prisma from "@/lib/prisma";

export async function GET() {
  const actor = await formActor();
  if (actor.error) return actor.error;
  const workspaceId = actor.member.workspaceId;
  const [members, tags, stages] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, role: { not: "VIEWER" } },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.tag.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.pipelineStage.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { position: "asc" },
    }),
  ]);
  return Response.json({ users: members.map((member) => member.user), tags, stages }, { headers: formHeaders });
}
