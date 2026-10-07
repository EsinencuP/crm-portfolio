import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view team members." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });

  try {
    const members = await prisma.user.findMany({
      where: { workspaceMembers: { some: { workspaceId: member.workspaceId } } },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        workspaceMembers: { where: { workspaceId: member.workspaceId }, select: { role: true } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return Response.json(
      {
        members: members.map(({ workspaceMembers, ...person }) => ({
          ...person,
          role: workspaceMembers[0]?.role ?? "MEMBER",
        })),
      },
      { headers },
    );
  } catch {
    return Response.json({ error: "Unable to load team members. Please try again." }, { status: 500, headers });
  }
}
