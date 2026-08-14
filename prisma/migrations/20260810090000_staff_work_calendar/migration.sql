-- ============================================================================
-- Hairlux additive migration — HCS v1.0 Part B, Phase 1: per-employee work
-- calendars. One row per (staff, day-of-week) describing that person's own
-- weekly pattern -- working/off/half-day, with their own resume/closing
-- times -- replacing sole reliance on the single global BusinessHours table
-- for attendance decisions. A day with no row for a given staff member
-- falls back to BusinessHours for that day of week (handled in application
-- code, not here). Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "StaffWorkDayType" AS ENUM ('WORKING', 'OFF', 'HALF_DAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "staff_work_calendars" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "day_type" "StaffWorkDayType" NOT NULL DEFAULT 'WORKING',
  "resume_time" TEXT,
  "closing_time" TEXT,
  "alternates_biweekly" BOOLEAN NOT NULL DEFAULT false,
  "active_week_parity" INTEGER,
  "alternate_day_type" "StaffWorkDayType",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_work_calendars_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_work_calendars_staff_id_day_of_week_key" ON "staff_work_calendars"("staff_id", "day_of_week");
CREATE INDEX IF NOT EXISTS "staff_work_calendars_staff_id_idx" ON "staff_work_calendars"("staff_id");

DO $$ BEGIN
  ALTER TABLE "staff_work_calendars" ADD CONSTRAINT "staff_work_calendars_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;