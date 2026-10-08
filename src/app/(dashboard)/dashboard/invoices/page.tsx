import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { InvoicesList } from "./_components/invoices-list";
export default async function InvoicesPage() {
  const member = await requireActiveWorkspaceMember();
  return <InvoicesList key={member.workspaceId} workspaceId={member.workspaceId} canWrite={member.role !== "VIEWER"} />;
}
