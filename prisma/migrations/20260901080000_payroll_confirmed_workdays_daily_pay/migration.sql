-- ============================================================================
-- Payroll: adds the "Confirmed Work Days" / effective Daily Pay figures
-- from the Payroll System Developer Implementation Guide's four
-- compensation-type rules. All three are informational -- computed after
-- salaryEarned/commissionEarned (which already drive actual pay) are
-- determined, never used to recompute them. Nullable/optional throughout,
-- matching the existing salary-section columns' pattern (e.g. dailyRate,
-- payableWorkdays) -- no default needed since PayrollEngineService always
-- sets them on generate/correct. No BEGIN/COMMIT, matching this project's
-- migration history.
-- ============================================================================

ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "confirmed_workdays" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "commission_period_confirmed_workdays" INTEGER;
ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "effective_daily_pay" DECIMAL(10,2);