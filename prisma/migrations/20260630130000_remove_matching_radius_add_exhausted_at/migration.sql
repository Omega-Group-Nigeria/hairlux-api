-- Drop configurable matching radius (now fixed progressive attempts in code)
ALTER TABLE "home_service_settings" DROP COLUMN "default_matching_radius_km";

-- Track when all matching attempts are exhausted for a booking
ALTER TABLE "bookings" ADD COLUMN "matching_exhausted_at" TIMESTAMP(3);