import { forbidden } from "next/navigation";

import { requireAuth } from "@/lib/auth-utils";
import { getActiveWorkspaceMember } from "@/lib/workspace";

import { WorkspaceSettingsForm } from "./workspace-settings-form";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage() {
  const user = await requireAuth();
  const member = await getActiveWorkspaceMember(user.id);
  if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) forbidden();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Workspace settings</h1>
        <p className="text-muted-foreground">Manage this organization’s identity and defaults.</p>
      </div>
      <WorkspaceSettingsForm initial={member.workspace} />
    </div>
  );
}
