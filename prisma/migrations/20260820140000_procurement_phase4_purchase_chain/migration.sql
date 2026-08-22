-- ============================================================================
-- Procurement, Inventory & Finance Integration — Phase 4b: the actual
-- Purchase Request -> Purchase -> Payment -> Receiving chain, built on
-- top of Phase 4a's configurable approval engine, Phase 1's
-- InventoryProduct catalogue, and Phase 3's FinancialTransaction ledger.
-- All tables created first, then every foreign key added at the end, to
-- avoid ordering issues between the seven new tables.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PurchaseRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PurchasePaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID', 'OVERPAID');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "purchase_requests" (
  "id" TEXT NOT NULL,
  "request_number" SERIAL,
  "branch_id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "requested_by_id" TEXT,
  "reason" TEXT NOT NULL,
  "attachment_url" TEXT,
  "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "approval_request_id" TEXT,
  "grand_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_requests_approval_request_id_key" ON "purchase_requests" ("approval_request_id");
CREATE INDEX IF NOT EXISTS "purchase_requests_branch_id_status_idx" ON "purchase_requests" ("branch_id", "status");
CREATE INDEX IF NOT EXISTS "purchase_requests_vendor_id_idx" ON "purchase_requests" ("vendor_id");

CREATE TABLE IF NOT EXISTS "purchase_request_lines" (
  "id" TEXT NOT NULL,
  "purchase_request_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "estimated_price" DECIMAL(10,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "purchase_request_lines_purchase_request_id_idx" ON "purchase_request_lines" ("purchase_request_id");
CREATE INDEX IF NOT EXISTS "purchase_request_lines_product_id_idx" ON "purchase_request_lines" ("product_id");

CREATE TABLE IF NOT EXISTS "purchases" (
  "id" TEXT NOT NULL,
  "purchase_number" SERIAL,
  "purchase_request_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "payment_status" "PurchasePaymentStatus" NOT NULL DEFAULT 'UNPAID',
  "grand_total" DECIMAL(12,2) NOT NULL,
  "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchases_purchase_request_id_key" ON "purchases" ("purchase_request_id");
CREATE INDEX IF NOT EXISTS "purchases_branch_id_status_idx" ON "purchases" ("branch_id", "status");
CREATE INDEX IF NOT EXISTS "purchases_vendor_id_idx" ON "purchases" ("vendor_id");
CREATE INDEX IF NOT EXISTS "purchases_payment_status_idx" ON "purchases" ("payment_status");

CREATE TABLE IF NOT EXISTS "purchase_lines" (
  "id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(10,2) NOT NULL,
  "line_total" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "purchase_lines_purchase_id_idx" ON "purchase_lines" ("purchase_id");
CREATE INDEX IF NOT EXISTS "purchase_lines_product_id_idx" ON "purchase_lines" ("product_id");

CREATE TABLE IF NOT EXISTS "purchase_payments" (
  "id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_method" TEXT NOT NULL,
  "payment_date" TIMESTAMP(3) NOT NULL,
  "payment_reference" TEXT,
  "recorded_by_id" TEXT,
  "financial_transaction_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "purchase_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_payments_financial_transaction_id_key" ON "purchase_payments" ("financial_transaction_id");
CREATE INDEX IF NOT EXISTS "purchase_payments_purchase_id_idx" ON "purchase_payments" ("purchase_id");

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" TEXT NOT NULL,
  "receipt_number" SERIAL,
  "purchase_id" TEXT NOT NULL,
  "received_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "received_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "goods_receipts_purchase_id_idx" ON "goods_receipts" ("purchase_id");

CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
  "id" TEXT NOT NULL,
  "goods_receipt_id" TEXT NOT NULL,
  "purchase_line_id" TEXT NOT NULL,
  "delivered_qty" INTEGER NOT NULL,
  "damaged_qty" INTEGER NOT NULL DEFAULT 0,
  "accepted_qty" INTEGER NOT NULL,
  "batch_lot_number" TEXT,
  "expiry_date" DATE,
  CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "goods_receipt_lines_goods_receipt_id_idx" ON "goods_receipt_lines" ("goods_receipt_id");
CREATE INDEX IF NOT EXISTS "goods_receipt_lines_purchase_line_id_idx" ON "goods_receipt_lines" ("purchase_line_id");

-- ── Foreign keys, added last across all seven tables ──

ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_requests_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_request_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_purchase_request_id_fkey" FOREIGN KEY ("purchase_request_id") REFERENCES "purchase_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "purchases_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_lines"
  ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "inventory_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_payments"
  ADD CONSTRAINT "purchase_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "purchase_payments_financial_transaction_id_fkey" FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipts_received_by_id_fkey" FOREIGN KEY ("received_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "goods_receipt_lines_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;