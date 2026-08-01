-- CreateEnum
CREATE TYPE "FcmPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- AlterTable
ALTER TABLE "payout_requests" ADD COLUMN "paystack_transfer_reference" TEXT;
CREATE UNIQUE INDEX "payout_requests_paystack_transfer_reference_key" ON "payout_requests"("paystack_transfer_reference");

ALTER TABLE "home_service_settings" ADD COLUMN "no_show_penalty_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "home_service_settings" ADD COLUMN "no_show_suspend_threshold" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "home_service_settings" ADD COLUMN "no_show_window_days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "fcm_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "FcmPlatform" NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fcm_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beautician_location_history" (
    "id" TEXT NOT NULL,
    "beautician_user_id" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(8,2),
    "booking_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beautician_location_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fcm_tokens_user_id_token_key" ON "fcm_tokens"("user_id", "token");

-- CreateIndex
CREATE INDEX "beautician_location_history_beautician_user_id_recorded_at_idx" ON "beautician_location_history"("beautician_user_id", "recorded_at");

-- CreateIndex
CREATE INDEX "beautician_location_history_booking_id_idx" ON "beautician_location_history"("booking_id");

-- AddForeignKey
ALTER TABLE "fcm_tokens" ADD CONSTRAINT "fcm_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_location_history" ADD CONSTRAINT "beautician_location_history_beautician_user_id_fkey" FOREIGN KEY ("beautician_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_location_history" ADD CONSTRAINT "beautician_location_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;