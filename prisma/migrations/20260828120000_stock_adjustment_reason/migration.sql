-- ============================================================================
-- Procurement/Inventory/Finance Integration, Phase 7: constrained
-- StockAdjustmentReason category, per the spec's fixed reason list.
-- reason itself is kept, relaxed to optional, as a detail alongside the
-- category. No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

CREATE TYPE "StockAdjustmentReason" AS ENUM ('DAMAGED', 'LOST', 'EXPIRED', 'FOUND', 'COUNTING_ERROR', 'OPENING_BALANCE', 'CORRECTION', 'OTHER');

-- stock_movements: nullable, like stock_type -- historical rows have no
-- category to backfill accurately.
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "reason_category" "StockAdjustmentReason";

-- stock_adjustment_requests: existing rows need a value before the column
-- can be made required (there's no accurate way to infer their original
-- category, so they're backfilled to OTHER, then this can go NOT NULL).
ALTER TABLE "stock_adjustment_requests" ADD COLUMN IF NOT EXISTS "reason_category" "StockAdjustmentReason";
UPDATE "stock_adjustment_requests" SET "reason_category" = 'OTHER' WHERE "reason_category" IS NULL;
ALTER TABLE "stock_adjustment_requests" ALTER COLUMN "reason_category" SET NOT NULL;
ALTER TABLE "stock_adjustment_requests" ALTER COLUMN "reason" DROP NOT NULL;