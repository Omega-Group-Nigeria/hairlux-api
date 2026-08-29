-- ============================================================================
-- Payroll Engine v2, Phase 1 (schema) -- full-month scheduled-workday
-- proration, CompensationType, CommissionPlan, and the Payslip
-- status/correction model per the Payroll System Developer Implementation
-- Guide. Apply via `prisma migrate deploy` / `prisma migrate resolve
-- --applied`, matching this project's established hand-written-migration
-- workflow. No BEGIN/COMMIT -- CREATE TYPE cannot share a transaction with
-- other DDL in this project's migration history.
-- ============================================================================

-- ── New enums ────────────────────────────────────────────────────────────
CREATE TYPE "CompensationType" AS ENUM ('SALARY', 'SALARY_TO_COMMISSION', 'SALARY_PLUS_COMMISSION', 'COMMISSION');
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CORRECTED', 'SUPERSEDED', 'CANCELLED');

-- ── CommissionPlan (new table) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "commission_plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "commission_rate" DECIMAL(5,4) NOT NULL,
  "eligible_service_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "applicable_branch_id" TEXT,
  "applicable_role" TEXT,
  "effective_date" DATE NOT NULL,
  "requires_approval" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commission_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "commission_plans_applicable_branch_id_idx" ON "commission_plans" ("applicable_branch_id");
CREATE INDEX IF NOT EXISTS "commission_plans_is_active_idx" ON "commission_plans" ("is_active");
ALTER TABLE "commission_plans"
  ADD CONSTRAINT "commission_plans_applicable_branch_id_fkey"
    FOREIGN KEY ("applicable_branch_id") REFERENCES "staff_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Staff: hire date, compensation type, assigned commission plan ──────
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "hire_date" DATE;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "compensation_type" "CompensationType" NOT NULL DEFAULT 'SALARY';
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "commission_plan_id" TEXT;
CREATE INDEX IF NOT EXISTS "staff_commission_plan_id_idx" ON "staff" ("commission_plan_id");
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_commission_plan_id_fkey"
    FOREIGN KEY ("commission_plan_id") REFERENCES "commission_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- salary_only_first_month is superseded by compensation_type = SALARY_TO_COMMISSION
-- plus the cutoff-day logic (Phase 2). Carry forward any staff who were
-- flagged under the old model to the closest new equivalent BEFORE
-- dropping the column, rather than silently losing this information --
-- this is a live prod-cloned database, existing data must not just
-- disappear. (Admin will still need to separately set an actual hireDate
-- for these staff, since the old boolean alone never captured one -- but
-- their compensation TYPE itself is preserved here.)
UPDATE "staff" SET "compensation_type" = 'SALARY_TO_COMMISSION' WHERE "salary_only_first_month" = true;

ALTER TABLE "staff" DROP COLUMN IF EXISTS "salary_only_first_month";

-- ── SalonBookingCommission: which plan produced it, approval workflow ──
ALTER TABLE "salon_booking_commissions" ADD COLUMN IF NOT EXISTS "commission_plan_id" TEXT;
ALTER TABLE "salon_booking_commissions" ADD COLUMN IF NOT EXISTS "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "salon_booking_commissions" ADD COLUMN IF NOT EXISTS "approved_by_id" TEXT;
ALTER TABLE "salon_booking_commissions" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "salon_booking_commissions_commission_plan_id_idx" ON "salon_booking_commissions" ("commission_plan_id");
CREATE INDEX IF NOT EXISTS "salon_booking_commissions_approval_status_idx" ON "salon_booking_commissions" ("approval_status");
ALTER TABLE "salon_booking_commissions"
  ADD CONSTRAINT "salon_booking_commissions_commission_plan_id_fkey"
    FOREIGN KEY ("commission_plan_id") REFERENCES "commission_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "salon_booking_commissions_approved_by_id_fkey"
    FOREIGN KEY ("approved_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Payslip: scheduled-workday breakdown, cutoff fields, commission-plan
-- traceability, and the status/correction model ────────────────────────
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "payslip_reference" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "salary_effective_date" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "full_month_scheduled_workdays" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "applicable_scheduled_workdays" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "missed_workdays" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "approved_extra_workdays_count" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "payable_workdays" DECIMAL(5,2);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "daily_rate" DECIMAL(10,2);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "salary_earned" DECIMAL(10,2);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "staff_hire_date_snapshot" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "cutoff_day_used" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "cutoff_classification" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "salary_period_start" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "salary_period_end" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_period_start" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_period_end" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "transition_date" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "cutoff_override_reason" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "cutoff_override_by_id" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_plan_id_used" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_rate_used" DECIMAL(5,4);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_rate_effective_date" DATE;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "supersedes_id" TEXT;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "correction_reference" TEXT;

-- Backfill payslip_reference for any existing rows before enforcing
-- NOT NULL/UNIQUE -- this database is a live prod clone, existing payslips
-- must not break. Uses the full id (already guaranteed unique) rather than
-- a truncated prefix, since correctness matters far more than readability
-- for this one-time historical backfill -- new payslips going forward get
-- a proper, readable reference generated by the Phase 2 engine instead.
UPDATE "payslips" SET "payslip_reference" = 'HL-PS-' || "id"
WHERE "payslip_reference" IS NULL;

ALTER TABLE "payslips" ALTER COLUMN "payslip_reference" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payslips_payslip_reference_key" ON "payslips" ("payslip_reference");
CREATE UNIQUE INDEX IF NOT EXISTS "payslips_supersedes_id_key" ON "payslips" ("supersedes_id");
CREATE INDEX IF NOT EXISTS "payslips_status_idx" ON "payslips" ("status");

ALTER TABLE "payslips"
  ADD CONSTRAINT "payslips_cutoff_override_by_id_fkey"
    FOREIGN KEY ("cutoff_override_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payslips_commission_plan_id_used_fkey"
    FOREIGN KEY ("commission_plan_id_used") REFERENCES "commission_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payslips_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "payslips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PayrollSettings: configurable cutoff day ────────────────────────────
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "salary_to_commission_cutoff_day" INTEGER NOT NULL DEFAULT 15;