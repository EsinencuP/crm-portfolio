-- Apply after 21-2-quotations.sql. Never run automatically against production.
BEGIN;
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INVOICE_PAID';
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER','CREDIT_CARD','PAYPAL','STRIPE','CASH','CHECK','OTHER');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','COMPLETED','FAILED','REFUNDED');
ALTER TABLE "Invoice"
  ADD COLUMN "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "sendState" "DocumentSendState" NOT NULL DEFAULT 'IDLE',
  ADD COLUMN "sentAt" TIMESTAMP(3), ADD COLUMN "emailMessageId" TEXT,
  ADD COLUMN "requestId" TEXT, ADD COLUMN "requestDigest" TEXT, ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD CONSTRAINT "Invoice_amountPaid_check" CHECK ("amountPaid" >= 0 AND "amountPaid" <= "grandTotal");
CREATE UNIQUE INDEX "Invoice_id_workspaceId_key" ON "Invoice"("id","workspaceId");
CREATE UNIQUE INDEX "Invoice_workspaceId_requestId_key" ON "Invoice"("workspaceId","requestId");
CREATE INDEX "Invoice_workspaceId_deletedAt_status_dueDate_idx" ON "Invoice"("workspaceId","deletedAt","status","dueDate");
CREATE TABLE "Payment" (
  "id" TEXT PRIMARY KEY, "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0), "currency" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL, "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
  "reference" TEXT, "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT,
  "invoiceId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL, "requestDigest" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_invoiceId_workspaceId_fkey" FOREIGN KEY ("invoiceId","workspaceId") REFERENCES "Invoice"("id","workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Payment_invoiceId_requestId_key" ON "Payment"("invoiceId","requestId");
CREATE UNIQUE INDEX "Payment_invoiceId_method_reference_key" ON "Payment"("invoiceId","method","reference");
CREATE INDEX "Payment_workspaceId_invoiceId_paidAt_idx" ON "Payment"("workspaceId","invoiceId","paidAt");
COMMIT;
