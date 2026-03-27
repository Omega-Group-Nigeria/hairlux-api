-- Add dual pricing + per-booking-type availability flags to services
ALTER TABLE "services"
  ADD COLUMN IF NOT EXISTS "walk_in_price" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "home_service_price" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "is_walk_in_available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "is_home_service_available" BOOLEAN NOT NULL DEFAULT true;

-- Backfill new prices from legacy single price column
UPDATE "services"
SET
  "walk_in_price" = COALESCE("walk_in_price", "price"),
  "home_service_price" = COALESCE("home_service_price", "price");

-- Enforce required prices
ALTER TABLE "services"
  ALTER COLUMN "walk_in_price" SET NOT NULL,
  ALTER COLUMN "home_service_price" SET NOT NULL;

-- Remove legacy single price column
ALTER TABLE "services"
  DROP COLUMN IF EXISTS "price";
