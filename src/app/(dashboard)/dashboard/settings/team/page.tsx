import { forbidden } from "next/navigation";

import { requireAuth } from "@/lib/auth-utils";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { TeamManagement } from "./_components/team-management";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const user = await requireAuth();
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role)) forbidden();
  return <TeamManagement currentUserId={user.id} currentRole={member.role} />;
}
