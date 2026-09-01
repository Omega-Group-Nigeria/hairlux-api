-- ============================================================================
-- Dev Feedback Round 8: replaces the progressive Nigeria PAYE band
-- calculation with a single, admin-configurable flat tax rate, matching
-- how pension_rate already works. Defaults to 0 (no tax deducted) rather
-- than a guessed percentage -- Hairlux's accountant should set this
-- deliberately. No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "tax_rate" DECIMAL(5,4) NOT NULL DEFAULT 0;