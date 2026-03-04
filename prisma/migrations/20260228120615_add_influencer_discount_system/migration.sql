-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('GENERAL', 'INFLUENCER');

-- AlterTable
ALTER TABLE "discount_codes" ADD COLUMN     "influencer_id" TEXT,
ADD COLUMN     "type" "DiscountType" NOT NULL DEFAULT 'GENERAL';

-- CreateTable
CREATE TABLE "discount_usages" (
    "id" TEXT NOT NULL,
    "discount_code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_reward_settings" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "reward_type" "ReferralRewardType" NOT NULL DEFAULT 'FIXED',
    "reward_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "min_purchase_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_reward_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_rewards" (
    "id" TEXT NOT NULL,
    "influencer_id" TEXT NOT NULL,
    "usage_id" TEXT NOT NULL,
    "reward_amount" DECIMAL(10,2) NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_usages_booking_id_key" ON "discount_usages"("booking_id");

-- CreateIndex
CREATE INDEX "discount_usages_discount_code_id_idx" ON "discount_usages"("discount_code_id");

-- CreateIndex
CREATE INDEX "discount_usages_user_id_idx" ON "discount_usages"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_rewards_usage_id_key" ON "influencer_rewards"("usage_id");

-- CreateIndex
CREATE INDEX "influencer_rewards_influencer_id_idx" ON "influencer_rewards"("influencer_id");

-- CreateIndex
CREATE INDEX "discount_codes_influencer_id_idx" ON "discount_codes"("influencer_id");

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_rewards" ADD CONSTRAINT "influencer_rewards_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_rewards" ADD CONSTRAINT "influencer_rewards_usage_id_fkey" FOREIGN KEY ("usage_id") REFERENCES "discount_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
