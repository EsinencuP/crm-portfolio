import { forbidden } from "next/navigation";

import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { QuotationEditor } from "../_components/quotation-editor";
export default async function NewQuotationPage() {
  const member = await requireActiveWorkspaceMember();
  if (member.role === "VIEWER") forbidden();
  return (
    <QuotationEditor
      key={member.workspaceId}
      workspaceId={member.workspaceId}
      issuerName={member.workspace.name}
      defaultCurrency={member.workspace.defaultCurrency}
    />
  );
}
