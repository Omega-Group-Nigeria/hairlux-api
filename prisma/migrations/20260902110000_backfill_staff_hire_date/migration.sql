-- ============================================================================
-- Backfills Staff.hire_date for legacy rows where it was never set.
--
-- hire_date is meant to be the date an applicant was converted to staff
-- during the application process. For staff created before that field
-- existed (or before it was consistently filled in), hire_date is NULL --
-- which silently breaks the SALARY_TO_COMMISSION 15th-cutoff rule for
-- exactly those staff members: PayrollSalaryCalculatorService.calculateForStaff
-- deliberately falls back to "treat as plain salary, no cutoff applied at
-- all" when hireDate is null, rather than guessing a transition date. That
-- fallback is correct in isolation, but a NULL hire_date on a real staff
-- member means the cutoff rule never actually runs for them -- which is
-- what this backfill fixes.
--
-- created_at is the best available proxy: it's set the moment the Staff
-- row itself was created, which for anyone who went through the
-- applicant-to-staff conversion flow is the same moment (or close enough
-- for payroll-cutoff purposes) as their actual hire date.
--
-- Only touches rows where hire_date IS NULL -- never overwrites a hire
-- date that's already on file, including one that happens to differ from
-- created_at (a real, deliberately-recorded date should never be
-- silently replaced by this proxy). ::date truncates created_at's time
-- component, matching hire_date's own @db.Date (no time) column type.
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

UPDATE "staff"
SET "hire_date" = "created_at"::date
WHERE "hire_date" IS NULL;