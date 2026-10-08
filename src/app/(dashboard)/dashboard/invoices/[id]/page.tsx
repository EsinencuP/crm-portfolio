import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { InvoiceDetail } from "../_components/invoice-detail";
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveWorkspaceMember(),
    { id } = await params;
  return <InvoiceDetail key={`${member.workspaceId}:${id}`} workspaceId={member.workspaceId} id={id} />;
}
