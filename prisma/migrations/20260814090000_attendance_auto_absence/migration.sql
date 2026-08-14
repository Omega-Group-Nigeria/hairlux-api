-- ============================================================================
-- Hairlux additive migration — automates marking a staff member ABSENT when
-- they were expected to work (per their own calendar) and never clocked in
-- at all. Nothing previously set ABSENT automatically anywhere in this
-- system. check_in_at becomes nullable to represent this: a real clock-in
-- always has one, an auto-marked absence never does. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "attendance_records"
  ALTER COLUMN "check_in_at" DROP NOT NULL;