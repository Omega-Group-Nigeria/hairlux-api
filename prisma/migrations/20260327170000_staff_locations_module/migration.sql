-- Create staff locations table
CREATE TABLE IF NOT EXISTS "staff_locations" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_locations_name_key"
  ON "staff_locations"("name");

-- Add location columns (nullable for backfill)
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "location_id" TEXT;

ALTER TABLE "staff_employment_history"
  ADD COLUMN IF NOT EXISTS "location_id" TEXT;

-- Seed locations from existing staff + history values
INSERT INTO "staff_locations" ("id", "name", "is_active", "created_at", "updated_at")
SELECT
  'loc_' || substr(md5(lower(src.name)), 1, 24) AS id,
  src.name,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT trim("business_location") AS name
  FROM "staff"
  WHERE "business_location" IS NOT NULL AND trim("business_location") <> ''

  UNION

  SELECT DISTINCT trim("business_location") AS name
  FROM "staff_employment_history"
  WHERE "business_location" IS NOT NULL AND trim("business_location") <> ''
) AS src
ON CONFLICT ("name") DO NOTHING;

-- Backfill foreign keys
UPDATE "staff" s
SET "location_id" = sl."id"
FROM "staff_locations" sl
WHERE trim(s."business_location") = sl."name"
  AND s."location_id" IS NULL;

UPDATE "staff_employment_history" seh
SET "location_id" = sl."id"
FROM "staff_locations" sl
WHERE trim(seh."business_location") = sl."name"
  AND seh."location_id" IS NULL;

-- Enforce not-null after backfill
ALTER TABLE "staff"
  ALTER COLUMN "location_id" SET NOT NULL;

ALTER TABLE "staff_employment_history"
  ALTER COLUMN "location_id" SET NOT NULL;

-- Add foreign keys
DO $$ BEGIN
  ALTER TABLE "staff"
    ADD CONSTRAINT "staff_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "staff_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "staff_employment_history"
    ADD CONSTRAINT "staff_employment_history_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "staff_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "staff_location_id_idx" ON "staff"("location_id");
CREATE INDEX IF NOT EXISTS "staff_employment_history_location_id_idx" ON "staff_employment_history"("location_id");

-- Drop legacy free-text location columns
ALTER TABLE "staff"
  DROP COLUMN IF EXISTS "business_location";

ALTER TABLE "staff_employment_history"
  DROP COLUMN IF EXISTS "business_location";
