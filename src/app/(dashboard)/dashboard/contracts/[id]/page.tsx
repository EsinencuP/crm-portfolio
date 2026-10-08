import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { ContractDetail } from "../_components/contract-detail";
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const [member, { id }] = await Promise.all([requireActiveWorkspaceMember(), params]);
  return <ContractDetail key={`${member.workspaceId}:${id}`} workspaceId={member.workspaceId} id={id} />;
}
