import { getCurrentUser } from "@/lib/auth-utils";
import { getUnreadCount } from "@/lib/notifications";
import { getActiveWorkspaceMember } from "@/lib/workspace";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) return Response.json({ error: "Please sign in." }, { status: 401, headers });
  const member = await getActiveWorkspaceMember(user.id);
  if (!member) return Response.json({ error: "Create a workspace first." }, { status: 409, headers });
  try {
    return Response.json({ count: await getUnreadCount(user.id, member.workspaceId) }, { headers });
  } catch {
    return Response.json({ error: "Unable to load unread count." }, { status: 500, headers });
  }
}
