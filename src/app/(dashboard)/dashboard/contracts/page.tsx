import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { ContractsList } from "./_components/contracts-list";
export default async function ContractsPage() {
  const member = await requireActiveWorkspaceMember();
  return (
    <ContractsList
      key={member.workspaceId}
      workspaceId={member.workspaceId}
      canWrite={member.role !== "VIEWER"}
      defaultCurrency={member.workspace.defaultCurrency}
    />
  );
}
