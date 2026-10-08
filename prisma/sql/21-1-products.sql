-- Additive migration; does not modify existing CRM records.
BEGIN;
CREATE TABLE "Product" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "sku" TEXT, "description" TEXT,
  "unitPrice" DECIMAL(12,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'USD',
  "unit" TEXT NOT NULL DEFAULT 'unit', "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "category" TEXT, "imageUrl" TEXT,
  "workspaceId" TEXT NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Product_unitPrice_check" CHECK ("unitPrice" >= 0),
  CONSTRAINT "Product_taxRate_check" CHECK ("taxRate" >= 0 AND "taxRate" <= 100),
  CONSTRAINT "Product_unit_check" CHECK ("unit" IN ('unit', 'hour', 'month', 'license'))
);
CREATE UNIQUE INDEX "Product_sku_workspaceId_key" ON "Product"("sku", "workspaceId");
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");
CREATE INDEX "Product_workspaceId_deletedAt_name_idx" ON "Product"("workspaceId", "deletedAt", "name");
CREATE INDEX "Product_workspaceId_deletedAt_category_isActive_idx" ON "Product"("workspaceId", "deletedAt", "category", "isActive");
COMMIT;
