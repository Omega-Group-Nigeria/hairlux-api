-- ============================================================================
-- Hairlux additive-only migration — link Stock Transfers to the shared
-- Approval Chain. Same reasoning/pattern as the migrations before it. Apply
-- via `prisma migrate deploy`. No BEGIN/COMMIT — Prisma wraps this itself.
-- ============================================================================

ALTER TABLE "stock_transfers"
  ADD COLUMN IF NOT EXISTS "approval_request_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "stock_transfers"
    ADD CONSTRAINT "stock_transfers_approval_request_id_key" UNIQUE ("approval_request_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "stock_transfers"
    ADD CONSTRAINT "stock_transfers_approval_request_id_fkey"
    FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;