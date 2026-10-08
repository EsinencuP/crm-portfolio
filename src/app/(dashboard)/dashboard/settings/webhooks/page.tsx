import { forbidden } from "next/navigation";

import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { WebhookSettings } from "./webhook-settings";

export default async function WebhooksPage() {
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN"].includes(member.role)) forbidden();
  return <WebhookSettings key={member.workspaceId} workspaceId={member.workspaceId} />;
}
