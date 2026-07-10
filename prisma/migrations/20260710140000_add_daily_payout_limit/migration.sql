-- Platform-wide daily payout pool limit (null = unlimited)
ALTER TABLE "home_service_settings"
ADD COLUMN "daily_payout_limit" DECIMAL(14, 2);
