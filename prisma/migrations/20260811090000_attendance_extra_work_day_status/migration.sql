-- ============================================================================
-- Hairlux additive migration — HCS v1.0 Part B, Phase 2: adds the
-- EXTRA_WORK_DAY_PENDING attendance status, used when a staff member clocks
-- in on a day their work calendar marks as OFF. ADD VALUE to an existing
-- enum cannot run in the same transaction as other DDL, so this migration
-- contains nothing else. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TYPE "AttendanceStatus" ADD VALUE IF NOT EXISTS 'EXTRA_WORK_DAY_PENDING';