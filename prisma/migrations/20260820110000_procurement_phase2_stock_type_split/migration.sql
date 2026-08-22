-- ============================================================================
-- Procurement, Inventory & Finance Integration — Phase 2: Store/Sales/Usage
-- stock split. Adds StockType enum, splits InventoryItem.currentQuantity
-- into storeStock/salesStock/usageStock (all existing stock -> Store, per
-- the agreed migration decision), adds required stockType to
-- StockAdjustmentRequest/StockTransfer (existing rows backfilled to STORE
-- for the same reason -- at the time they were created, stock was one
-- undifferentiated pool), and nullable stockType to StockMovement
-- (historical movements have no accurate value to backfill; every new
-- movement going forward should set it).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "StockType" AS ENUM ('STORE', 'SALES', 'USAGE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'ALLOCATED';

-- ── InventoryItem: add the three new columns, backfill, then drop the old one ──

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "store_stock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sales_stock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "usage_stock" INTEGER NOT NULL DEFAULT 0;

UPDATE "inventory_items" SET "store_stock" = "current_quantity";

ALTER TABLE "inventory_items" DROP COLUMN IF EXISTS "current_quantity";

-- ── StockAdjustmentRequest: add required stockType, backfill existing rows ──

ALTER TABLE "stock_adjustment_requests"
  ADD COLUMN IF NOT EXISTS "stock_type" "StockType";

UPDATE "stock_adjustment_requests" SET "stock_type" = 'STORE' WHERE "stock_type" IS NULL;

ALTER TABLE "stock_adjustment_requests"
  ALTER COLUMN "stock_type" SET NOT NULL;

-- ── StockTransfer: add required stockType, backfill existing rows ──

ALTER TABLE "stock_transfers"
  ADD COLUMN IF NOT EXISTS "stock_type" "StockType";

UPDATE "stock_transfers" SET "stock_type" = 'STORE' WHERE "stock_type" IS NULL;

ALTER TABLE "stock_transfers"
  ALTER COLUMN "stock_type" SET NOT NULL;

-- ── StockMovement: nullable, no backfill -- historical movements have no
-- accurate value; every new movement going forward should set it ──

ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "stock_type" "StockType";