-- ============================================================================
-- Hairlux additive migration — late_penalty_settings (a singleton row, same
-- pattern as referral_settings) plus attendance_records.late_penalty_amount.
-- Grace-period minutes stay exactly where they already lived (StaffLocation /
-- Staff.late_grace_period_override) — this only adds the missing per-minute
-- charge. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "late_penalty_settings" (
  "id" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "amount_per_minute" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "late_penalty_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "late_penalty_amount" DECIMAL(10,2);