-- AlterTable
ALTER TABLE "beautician_profiles" ADD COLUMN "payout_bank_code" TEXT;
ALTER TABLE "beautician_profiles" ADD COLUMN "payout_account_number" TEXT;
ALTER TABLE "beautician_profiles" ADD COLUMN "payout_account_name" TEXT;
ALTER TABLE "beautician_profiles" ADD COLUMN "paystack_recipient_code" TEXT;
ALTER TABLE "beautician_profiles" ADD COLUMN "payout_bank_verified_at" TIMESTAMP(3);