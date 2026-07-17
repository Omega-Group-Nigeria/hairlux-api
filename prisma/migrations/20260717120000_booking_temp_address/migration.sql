-- Temporary / current-location fields for HOME_SERVICE bookings without a saved addressId
ALTER TABLE "bookings" ADD COLUMN "temp_latitude" DECIMAL(10,7);
ALTER TABLE "bookings" ADD COLUMN "temp_longitude" DECIMAL(10,7);
ALTER TABLE "bookings" ADD COLUMN "temp_full_address" TEXT;
