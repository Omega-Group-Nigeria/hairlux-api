-- Remove legacy address columns now that maps-first fields are the source of truth
ALTER TABLE "addresses"
DROP COLUMN IF EXISTS "address_line",
DROP COLUMN IF EXISTS "postal_code",
DROP COLUMN IF EXISTS "latitude",
DROP COLUMN IF EXISTS "longitude";
