-- ============================================================================
-- Dev Feedback Round 5, item #3: staff deductions with a correction audit
-- trail. Adds effectiveDate/notes to PayrollAdjustment, and the same
-- status/supersedesId/correctionReason correction pattern already used
-- by Payslip -- a correction keeps the original row (SUPERSEDED) and
-- creates a new one, rather than overwriting amount in place. No
-- BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

CREATE TYPE "PayrollAdjustmentStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "effective_date" DATE;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "status" "PayrollAdjustmentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "supersedes_id" TEXT;
ALTER TABLE "payroll_adjustments" ADD COLUMN IF NOT EXISTS "correction_reason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_adjustments_supersedes_id_key" ON "payroll_adjustments" ("supersedes_id");

ALTER TABLE "payroll_adjustments"
  ADD CONSTRAINT "payroll_adjustments_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "payroll_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;