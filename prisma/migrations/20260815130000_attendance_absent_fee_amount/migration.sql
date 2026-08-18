-- ============================================================================
-- Adds absentFeeAmount to AttendanceRecord — frozen at the moment ABSENT is
-- recorded (same convention as latePenaltyAmount at check-in), so staff can
-- see the fine immediately rather than waiting for payroll to compute it.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "attendance_records"
  ADD COLUMN IF NOT EXISTS "absent_fee_amount" DECIMAL(10, 2);