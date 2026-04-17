-- AlterTable
ALTER TABLE "addresses"
ADD COLUMN "full_address" TEXT,
ADD COLUMN "street_address" TEXT,
ADD COLUMN "place_id" TEXT,
ADD COLUMN "address_components" JSONB;

-- Make legacy required location fields optional for maps-first partial updates
ALTER TABLE "addresses"
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "state" DROP NOT NULL;

-- Backfill full_address, street_address, and address_components from legacy columns
UPDATE "addresses"
SET
  "full_address" = COALESCE(
    "full_address",
    NULLIF(CONCAT_WS(', ', "address_line", "city", "state", "country"), '')
  ),
  "street_address" = COALESCE("street_address", "address_line"),
  "address_components" = COALESCE(
    "address_components",
    jsonb_strip_nulls(
      jsonb_build_object(
        'streetAddress', "address_line",
        'city', "city",
        'state', "state",
        'country', "country"
      )
    )
  );

-- Enforce full_address after backfill
ALTER TABLE "addresses"
ALTER COLUMN "full_address" SET NOT NULL;

-- Helpful lookup index for default-address resolution
CREATE INDEX IF NOT EXISTS "addresses_user_id_is_default_idx"
ON "addresses"("user_id", "is_default");
