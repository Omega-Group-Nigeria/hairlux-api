-- ============================================================================
-- Dev Feedback Round 8/9, item #5's post-release half: correcting a payslip
-- (correctPayslip) previously only ever did a blind full recalculation from
-- current underlying data (attendance, adjustments, compensation) -- an
-- admin had no way to type in a specific corrected figure directly, and no
-- visibility into which fields a correction actually touched. This column
-- records which fields, if any, were manually overridden on a given
-- payslip row (correction or not) -- an empty array means the row is a
-- pure recalculation, same as every payslip before this feature existed.
-- IF NOT EXISTS / DEFAULT '{}' guards this the same way the rest of this
-- project's migration history does. No BEGIN/COMMIT, matching convention.
-- ============================================================================

ALTER TABLE "payslips" ADD COLUMN IF NOT EXISTS "manual_override_fields" TEXT[] NOT NULL DEFAULT '{}';