-- ============================================================================
-- Extends customer_value_settings (already the single-row admin-configurable
-- table for Value thresholds) with Lifecycle thresholds too — both
-- classification dimensions now share one settings row, editable from the
-- same admin page. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "customer_value_settings"
  ADD COLUMN IF NOT EXISTS "new_account_age_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "new_visit_count_threshold" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "active_days_threshold" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "at_risk_days_threshold" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "dormant_days_threshold" INTEGER NOT NULL DEFAULT 180;