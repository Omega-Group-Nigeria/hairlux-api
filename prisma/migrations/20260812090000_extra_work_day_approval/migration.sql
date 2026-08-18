-- ============================================================================
-- Hairlux additive migration — HCS v1.0 Part B, Phase 3: approval workflow
-- for Extra Work Day attendance records (a clock-in on a day the staff
-- member's own calendar marks OFF). Apply via `prisma migrate deploy`.
-- No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "ExtraWorkDayApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "extra_work_day_approval" "ExtraWorkDayApprovalStatus",
  ADD COLUMN IF NOT EXISTS "extra_work_day_decided_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "extra_work_day_decided_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "extra_work_day_note" TEXT;

CREATE INDEX IF NOT EXISTS "attendance_records_status_extra_work_day_approval_idx" ON "attendance_records"("status", "extra_work_day_approval");

DO $$ BEGIN
  ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_extra_work_day_decided_by_id_fkey" FOREIGN KEY ("extra_work_day_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "payslips"
  ADD COLUMN IF NOT EXISTS "extra_work_day_earnings" DECIMAL(10,2) NOT NULL DEFAULT 0;