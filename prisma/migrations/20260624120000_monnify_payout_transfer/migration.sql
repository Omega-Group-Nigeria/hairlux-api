-- Drop Paystack recipient code from beautician profiles
ALTER TABLE "beautician_profiles" DROP COLUMN IF EXISTS "paystack_recipient_code";

-- Rename Paystack transfer reference to Monnify on payout requests
ALTER TABLE "payout_requests" RENAME COLUMN "paystack_transfer_reference" TO "monnify_transfer_reference";

ALTER INDEX "payout_requests_paystack_transfer_reference_key"
  RENAME TO "payout_requests_monnify_transfer_reference_key";