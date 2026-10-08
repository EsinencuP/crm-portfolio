import { forbidden } from "next/navigation";

import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { WorkflowsList } from "./_components/workflows-list";

export default async function WorkflowsPage() {
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role)) forbidden();
  return <WorkflowsList key={member.workspaceId} workspaceId={member.workspaceId} />;
}
