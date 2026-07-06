-- Restore Paystack recipient code on beautician profiles
ALTER TABLE "beautician_profiles" ADD COLUMN IF NOT EXISTS "paystack_recipient_code" TEXT;

-- Revert payout transfer reference from Monnify back to Paystack
ALTER TABLE "payout_requests" RENAME COLUMN "monnify_transfer_reference" TO "paystack_transfer_reference";

ALTER INDEX IF EXISTS "payout_requests_monnify_transfer_reference_key"
  RENAME TO "payout_requests_paystack_transfer_reference_key";

-- Store Paystack transfer_code for approval / finalize API
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "paystack_transfer_code" TEXT;