-- ============================================================================
-- Hairlux additive migration — staff.salary_only_first_month. Data capture
-- only for now (no Payroll module exists yet to act on it): true = this
-- staff member is paid salary for their first month only, commission for
-- every month after. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "salary_only_first_month" BOOLEAN NOT NULL DEFAULT false;