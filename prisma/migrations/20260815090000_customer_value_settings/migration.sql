-- ============================================================================
-- Hairlux additive migration — CRM & Retention Engine: configurable
-- Premium/VIP spend thresholds (single-row settings table, matching the
-- existing BusinessSettings pattern). Apply via `prisma migrate deploy`.
-- No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "customer_value_settings" (
  "id" TEXT NOT NULL,
  "premium_spend_threshold" DECIMAL(10,2) NOT NULL DEFAULT 50000,
  "vip_spend_threshold" DECIMAL(10,2) NOT NULL DEFAULT 200000,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by_id" TEXT,
  CONSTRAINT "customer_value_settings_pkey" PRIMARY KEY ("id")
);