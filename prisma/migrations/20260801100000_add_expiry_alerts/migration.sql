-- ============================================================================
-- Hairlux additive migration — expiry_alerts, a real alert system for
-- inventory items with an expiry date (separate from low-stock alerts).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "ExpiryAlertSeverity" AS ENUM ('EXPIRING_SOON', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "expiry_alerts" (
  "id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "severity" "ExpiryAlertSeverity" NOT NULL,
  "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_id" TEXT,
  CONSTRAINT "expiry_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expiry_alerts_item_id_resolved_at_idx" ON "expiry_alerts"("item_id", "resolved_at");

DO $$ BEGIN
  ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "expiry_alerts" ADD CONSTRAINT "expiry_alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;