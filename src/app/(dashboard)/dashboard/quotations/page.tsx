import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { QuotationsList } from "./_components/quotations-list";
export default async function QuotationsPage() {
  const member = await requireActiveWorkspaceMember();
  return (
    <QuotationsList key={member.workspaceId} workspaceId={member.workspaceId} canWrite={member.role !== "VIEWER"} />
  );
}
