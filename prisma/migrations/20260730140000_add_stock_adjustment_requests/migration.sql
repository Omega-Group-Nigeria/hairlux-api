-- ============================================================================
-- Hairlux additive-only migration — Stock Adjustment Requests
-- Same reasoning/pattern as the three migrations before it. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT — Prisma wraps this itself.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "stock_adjustment_requests" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "quantity_delta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "approval_request_id" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_adjustment_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "stock_adjustment_requests_item_id_status_idx" ON "stock_adjustment_requests"("item_id", "status");

DO $$ BEGIN
  ALTER TABLE "stock_adjustment_requests"
    ADD CONSTRAINT "stock_adjustment_requests_approval_request_id_key" UNIQUE ("approval_request_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_adjustment_requests"
    ADD CONSTRAINT "stock_adjustment_requests_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_adjustment_requests"
    ADD CONSTRAINT "stock_adjustment_requests_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "staff"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_adjustment_requests"
    ADD CONSTRAINT "stock_adjustment_requests_approval_request_id_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
