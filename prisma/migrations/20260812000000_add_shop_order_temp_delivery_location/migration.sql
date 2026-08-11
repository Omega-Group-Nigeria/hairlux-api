-- Add temporary / current-location delivery support to shop orders.
-- Existing saved-address orders keep their address_id; new temp orders store
-- lat/lng + human-readable label + state for delivery region pricing.

ALTER TABLE "shop_orders" ALTER COLUMN "address_id" DROP NOT NULL;

ALTER TABLE "shop_orders"
  ADD COLUMN "temp_latitude" DECIMAL(10, 7),
  ADD COLUMN "temp_longitude" DECIMAL(10, 7),
  ADD COLUMN "temp_full_address" TEXT,
  ADD COLUMN "temp_state" TEXT;
