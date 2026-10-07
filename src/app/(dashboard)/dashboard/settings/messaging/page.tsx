import { forbidden } from "next/navigation";

import { isWorkspaceAdmin } from "@/lib/permissions";
import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { MessagingSettings } from "./messaging-settings";

export default async function MessagingSettingsPage() {
  const member = await requireActiveWorkspaceMember();
  if (!isWorkspaceAdmin(member.role)) forbidden();
  return <MessagingSettings workspaceId={member.workspaceId} />;
}
