-- ============================================================================
-- Hairlux additive migration — HCS v1.0 Part B, Phase 4:
--   1. Structured attendance correction reasons (fixed categories instead
--      of free text only).
--   2. Branch-level BusinessException support — a null branch_id stays
--      company-wide (unchanged existing behavior); a set branch_id scopes
--      the exception to just that branch.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "AttendanceOverrideReason" AS ENUM (
    'OFFICIAL_ASSIGNMENT', 'BUSINESS_TRAVEL', 'TRAINING',
    'DEVICE_FINGERPRINT_FAILURE', 'APPROVED_MANUAL_ATTENDANCE', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "adjustment_reason_category" "AttendanceOverrideReason";

-- Drop the old one-exception-per-date-ever constraint — a date can now
-- have both a company-wide exception AND separate branch-specific ones.
-- Application code enforces "one company-wide row per date" and "one row
-- per (date, branch)" instead, since Postgres unique indexes treat NULL as
-- distinct and can't express that directly.
DROP INDEX IF EXISTS "business_exceptions_date_key";

ALTER TABLE "business_exceptions"
  ADD COLUMN IF NOT EXISTS "branch_id" TEXT;

CREATE INDEX IF NOT EXISTS "business_exceptions_date_idx" ON "business_exceptions"("date");
CREATE INDEX IF NOT EXISTS "business_exceptions_branch_id_date_idx" ON "business_exceptions"("branch_id", "date");

DO $$ BEGIN
  ALTER TABLE "business_exceptions" ADD CONSTRAINT "business_exceptions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;