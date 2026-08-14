-- ============================================================================
-- Hairlux additive migration — Daily Cash Reconciliation, the first real
-- piece of the branch-level "Daily Cash Manager" financial suite built into
-- HCS. One row per branch per date; both revenue figures are snapshots
-- taken at submission time rather than recalculated later. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "daily_cash_reconciliations" (
  "id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "total_revenue" DECIMAL(10,2) NOT NULL,
  "expected_cash" DECIMAL(10,2) NOT NULL,
  "cash_counted" DECIMAL(10,2) NOT NULL,
  "variance" DECIMAL(10,2) NOT NULL,
  "notes" TEXT,
  "submitted_by_id" TEXT,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_cash_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_cash_reconciliations_branch_id_date_key" ON "daily_cash_reconciliations"("branch_id", "date");
CREATE INDEX IF NOT EXISTS "daily_cash_reconciliations_branch_id_date_idx" ON "daily_cash_reconciliations"("branch_id", "date");

DO $$ BEGIN
  ALTER TABLE "daily_cash_reconciliations" ADD CONSTRAINT "daily_cash_reconciliations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "daily_cash_reconciliations" ADD CONSTRAINT "daily_cash_reconciliations_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;