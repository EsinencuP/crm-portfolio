-- Apply after 21-1-products.sql. Additive, no automatic execution or data deletion.
BEGIN;
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CONVERTED');
CREATE TYPE "DocumentSendState" AS ENUM ('IDLE','SENDING','SENT','UNCERTAIN');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT','SENT','PAID','OVERDUE','CANCELLED');
CREATE TABLE "DocumentSequence" (
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL, "year" INTEGER NOT NULL, "counter" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("workspaceId","kind","year"), CHECK ("counter" >= 0), CHECK ("kind" IN ('QUO','INV','CTR'))
);
CREATE TABLE "Quotation" (
  "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiryDate" TIMESTAMP(3), "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(12,2) NOT NULL, "taxTotal" DECIMAL(12,2) NOT NULL, "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0, "grandTotal" DECIMAL(12,2) NOT NULL,
  "notes" TEXT, "terms" TEXT, "clientName" TEXT NOT NULL, "clientEmail" TEXT, "issuerName" TEXT NOT NULL,
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "companyId" TEXT REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dealId" TEXT REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sendState" "DocumentSendState" NOT NULL DEFAULT 'IDLE', "sentAt" TIMESTAMP(3), "emailMessageId" TEXT,
  "requestId" TEXT NOT NULL, "requestDigest" TEXT NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("contactId" IS NOT NULL OR "companyId" IS NOT NULL),
  CHECK ("expiryDate" IS NULL OR "expiryDate" >= "issueDate"),
  CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "discountTotal" >= 0 AND "grandTotal" >= 0),
  CHECK ("grandTotal" = "subtotal" - "discountTotal" + "taxTotal")
);
CREATE UNIQUE INDEX "Quotation_workspaceId_number_key" ON "Quotation"("workspaceId","number");
CREATE UNIQUE INDEX "Quotation_workspaceId_requestId_key" ON "Quotation"("workspaceId","requestId");
CREATE INDEX "Quotation_workspaceId_deletedAt_createdAt_idx" ON "Quotation"("workspaceId","deletedAt","createdAt");
CREATE INDEX "Quotation_workspaceId_ownerId_status_idx" ON "Quotation"("workspaceId","ownerId","status");
CREATE TABLE "Invoice" (
  "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueDate" TIMESTAMP(3), "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(12,2) NOT NULL, "taxTotal" DECIMAL(12,2) NOT NULL, "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0, "grandTotal" DECIMAL(12,2) NOT NULL,
  "notes" TEXT, "terms" TEXT, "clientName" TEXT NOT NULL, "clientEmail" TEXT, "issuerName" TEXT NOT NULL,
  "contactId" TEXT REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "companyId" TEXT REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dealId" TEXT REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "ownerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quotationId" TEXT REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "discountTotal" >= 0 AND "grandTotal" >= 0),
  CHECK ("grandTotal" = "subtotal" - "discountTotal" + "taxTotal")
);
CREATE UNIQUE INDEX "Invoice_workspaceId_number_key" ON "Invoice"("workspaceId","number");
CREATE UNIQUE INDEX "Invoice_quotationId_key" ON "Invoice"("quotationId");
CREATE INDEX "Invoice_workspaceId_createdAt_idx" ON "Invoice"("workspaceId","createdAt");
CREATE TABLE "LineItem" (
  "id" TEXT PRIMARY KEY, "productId" TEXT REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "description" TEXT NOT NULL, "quantity" DECIMAL(10,2) NOT NULL, "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(5,2) NOT NULL DEFAULT 0, "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0, "total" DECIMAL(12,2) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "quotationId" TEXT REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "invoiceId" TEXT REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (("quotationId" IS NOT NULL)::int + ("invoiceId" IS NOT NULL)::int = 1),
  CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "total" >= 0 AND "position" >= 0),
  CHECK ("discount" BETWEEN 0 AND 100 AND "taxRate" BETWEEN 0 AND 100)
);
CREATE INDEX "LineItem_quotationId_position_idx" ON "LineItem"("quotationId","position");
CREATE INDEX "LineItem_invoiceId_position_idx" ON "LineItem"("invoiceId","position");
CREATE INDEX "LineItem_productId_idx" ON "LineItem"("productId");
COMMIT;
