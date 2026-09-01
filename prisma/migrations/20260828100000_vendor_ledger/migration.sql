-- ============================================================================
-- Procurement/Inventory/Finance Integration, Phase 5: Vendor Ledger.
-- The ledger balance itself is computed on read from existing data
-- (Purchase, PurchasePayment, GoodsReceipt/GoodsReceiptLine) -- this
-- migration only adds the one missing input: standalone credit/debit
-- adjustments against a vendor. No BEGIN/COMMIT, matching this project's
-- migration history.
-- ============================================================================

CREATE TYPE "VendorLedgerAdjustmentType" AS ENUM ('CREDIT', 'DEBIT');

CREATE TABLE IF NOT EXISTS "vendor_ledger_adjustments" (
  "id" TEXT NOT NULL,
  "vendor_id" TEXT NOT NULL,
  "type" "VendorLedgerAdjustmentType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "reference_purchase_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_ledger_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vendor_ledger_adjustments_vendor_id_idx" ON "vendor_ledger_adjustments" ("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_ledger_adjustments_reference_purchase_id_idx" ON "vendor_ledger_adjustments" ("reference_purchase_id");

ALTER TABLE "vendor_ledger_adjustments"
  ADD CONSTRAINT "vendor_ledger_adjustments_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "vendor_ledger_adjustments_reference_purchase_id_fkey"
    FOREIGN KEY ("reference_purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "vendor_ledger_adjustments_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;