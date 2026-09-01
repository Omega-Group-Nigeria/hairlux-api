-- ============================================================================
-- Payroll Engine v2, Phase 3: payslip correction model. A correction needs
-- a second row to coexist with the original for the same
-- (payroll_period_id, staff_id) pair -- the original is retained, marked
-- SUPERSEDED, per the guide's "retain the original" requirement -- so the
-- previous full unique constraint on that pair is replaced with a partial
-- one that only enforces uniqueness among ACTIVE payslips (anything not
-- already SUPERSEDED). No BEGIN/COMMIT, matching this project's migration
-- history.
-- ============================================================================

-- Drop the old, unconditional unique index (created as a unique INDEX, not
-- a named CONSTRAINT, per its origin in migration
-- 20260802110000_add_payroll_wallet_system -- DROP CONSTRAINT would not
-- match this object).
DROP INDEX IF EXISTS "payslips_payroll_period_id_staff_id_key";

-- Plain (non-unique) index for query performance -- the schema.prisma
-- @@index([payrollPeriodId, staffId]) that replaced the old @@unique.
CREATE INDEX IF NOT EXISTS "payslips_payroll_period_id_staff_id_idx" ON "payslips" ("payroll_period_id", "staff_id");

-- The real uniqueness constraint: only one ACTIVE (non-superseded) payslip
-- per (period, staff) pair at a time. Multiple SUPERSEDED rows for the
-- same pair are allowed to coexist -- one per correction, forming the
-- full history chain via supersedes_id.
CREATE UNIQUE INDEX IF NOT EXISTS "payslips_active_period_staff_key"
  ON "payslips" ("payroll_period_id", "staff_id")
  WHERE "status" != 'SUPERSEDED';