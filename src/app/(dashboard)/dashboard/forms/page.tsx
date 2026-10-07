import { forbidden } from "next/navigation";

import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { FormsList } from "./_components/forms-list";

export default async function FormsPage() {
  const member = await requireActiveWorkspaceMember();
  if (!["OWNER", "ADMIN", "MANAGER"].includes(member.role)) forbidden();
  return <FormsList key={member.workspaceId} workspaceId={member.workspaceId} />;
}
