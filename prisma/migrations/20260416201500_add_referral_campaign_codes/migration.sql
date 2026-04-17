-- Create table for admin-managed signup referral campaign codes
CREATE TABLE "referral_campaign_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "signup_bonus_amount" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_campaign_codes_pkey" PRIMARY KEY ("id")
);

-- Create table to track per-user usage of signup referral campaign codes
CREATE TABLE "referral_campaign_code_usages" (
    "id" TEXT NOT NULL,
    "campaign_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "bonus_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_campaign_code_usages_pkey" PRIMARY KEY ("id")
);

-- Constraints
CREATE UNIQUE INDEX "referral_campaign_codes_code_key" ON "referral_campaign_codes"("code");
CREATE INDEX "referral_campaign_codes_is_active_idx" ON "referral_campaign_codes"("is_active");

CREATE UNIQUE INDEX "referral_campaign_code_usages_user_id_key" ON "referral_campaign_code_usages"("user_id");
CREATE UNIQUE INDEX "referral_campaign_code_usages_transaction_id_key" ON "referral_campaign_code_usages"("transaction_id");
CREATE INDEX "referral_campaign_code_usages_campaign_code_id_idx" ON "referral_campaign_code_usages"("campaign_code_id");

ALTER TABLE "referral_campaign_code_usages"
ADD CONSTRAINT "referral_campaign_code_usages_campaign_code_id_fkey"
FOREIGN KEY ("campaign_code_id") REFERENCES "referral_campaign_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_campaign_code_usages"
ADD CONSTRAINT "referral_campaign_code_usages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "referral_campaign_code_usages"
ADD CONSTRAINT "referral_campaign_code_usages_transaction_id_fkey"
FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
