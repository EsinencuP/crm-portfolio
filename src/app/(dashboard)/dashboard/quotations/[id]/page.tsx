import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { QuotationDetail } from "../_components/quotation-detail";
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireActiveWorkspaceMember(),
    { id } = await params;
  return <QuotationDetail key={`${member.workspaceId}:${id}`} workspaceId={member.workspaceId} id={id} />;
}
