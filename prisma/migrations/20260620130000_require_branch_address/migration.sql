-- Backfill any legacy rows before enforcing NOT NULL
UPDATE "staff_locations"
SET "address" = 'Address not set'
WHERE "address" IS NULL OR trim("address") = '';

ALTER TABLE "staff_locations"
  ALTER COLUMN "address" SET NOT NULL;