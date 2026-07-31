-- ============================================================================
-- Hairlux additive migration — staff_code_history, supporting branch
-- transfer with an auto-issued new staff code and a retired old one that
-- can never be reused. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "staff_code_history" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "active_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active_until" TIMESTAMP(3),
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_code_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_code_history_staff_id_active_from_idx" ON "staff_code_history"("staff_id", "active_from");

DO $$ BEGIN
  ALTER TABLE "staff_code_history" ADD CONSTRAINT "staff_code_history_code_key" UNIQUE ("code");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_code_history" ADD CONSTRAINT "staff_code_history_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_code_history" ADD CONSTRAINT "staff_code_history_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;