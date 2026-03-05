-- Add INFLUENCER_REWARD to TransactionType enum
ALTER TYPE "TransactionType" ADD VALUE 'INFLUENCER_REWARD';

-- AlterTable influencers: drop old standalone fields
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "name";
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "influencers" DROP COLUMN IF EXISTS "email";

-- Add user_id as nullable first (allows existing rows to survive)
ALTER TABLE "influencers" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

-- Delete dependent child records first to avoid FK violations,
-- then delete orphan influencer rows (legacy standalone records with no user link)
DELETE FROM "influencer_rewards"
  WHERE "influencer_id" IN (SELECT "id" FROM "influencers" WHERE "user_id" IS NULL);

DELETE FROM "discount_codes"
  WHERE "influencer_id" IN (SELECT "id" FROM "influencers" WHERE "user_id" IS NULL);

DELETE FROM "influencers" WHERE "user_id" IS NULL;

-- Now enforce NOT NULL + unique + FK
ALTER TABLE "influencers" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_user_id_key" UNIQUE ("user_id");
ALTER TABLE "influencers" ADD CONSTRAINT "influencers_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable influencer_rewards: add wallet_transaction_id
ALTER TABLE "influencer_rewards" ADD COLUMN IF NOT EXISTS "wallet_transaction_id" TEXT;
ALTER TABLE "influencer_rewards" ADD CONSTRAINT "influencer_rewards_wallet_transaction_id_key" UNIQUE ("wallet_transaction_id");
ALTER TABLE "influencer_rewards" ADD CONSTRAINT "influencer_rewards_wallet_transaction_id_fkey"
  FOREIGN KEY ("wallet_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
