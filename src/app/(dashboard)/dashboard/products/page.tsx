import { requireActiveWorkspaceMember } from "@/lib/workspace";

import { ProductsCatalog } from "./_components/products-catalog";

export default async function ProductsPage() {
  const member = await requireActiveWorkspaceMember();
  return (
    <ProductsCatalog
      key={member.workspaceId}
      workspaceId={member.workspaceId}
      canWrite={member.role !== "VIEWER"}
      defaultCurrency={member.workspace.defaultCurrency}
    />
  );
}
