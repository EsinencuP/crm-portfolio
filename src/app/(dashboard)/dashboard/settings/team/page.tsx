import { requireRole } from "@/lib/auth-utils";

import { TeamManagement } from "./_components/team-management";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const user = await requireRole(["ADMIN", "MANAGER"]);
  return <TeamManagement currentUserId={user.id} currentRole={user.role} />;
}
