-- ============================================================================
-- Adds phone_otp_code and phone_otp_expiry to users, for the "add and
-- verify a phone number from Settings" flow -- entirely separate from the
-- existing email otp_code/otp_expiry columns, so email and phone
-- verification can be in progress independently.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "phone_otp_code" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_otp_expiry" TIMESTAMP(3);