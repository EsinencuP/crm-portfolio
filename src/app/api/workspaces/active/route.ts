import { z } from "zod";

import { auth } from "@/lib/auth";
import { getActiveWorkspaceMember, setActiveWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(session.user.id);
  return Response.json({ workspace: member?.workspace ?? null, role: member?.role ?? null }, { headers });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const parsed = z.object({ workspaceId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid workspace ID." }, { status: 400, headers });
  try {
    await setActiveWorkspace(session.user.id, parsed.data.workspaceId);
    return Response.json({ success: true }, { headers });
  } catch {
    return Response.json({ error: "Workspace unavailable." }, { status: 404, headers });
  }
}
