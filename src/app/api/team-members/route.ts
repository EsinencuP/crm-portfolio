import { getCurrentUser } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in to view team members." }, { status: 401, headers });

  try {
    const members = await prisma.user.findMany({
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return Response.json({ members }, { headers });
  } catch {
    return Response.json({ error: "Unable to load team members. Please try again." }, { status: 500, headers });
  }
}
