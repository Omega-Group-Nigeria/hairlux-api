-- Drop beautician base location and per-profile service radius (matching uses live GPS + global settings).
ALTER TABLE "beautician_profiles" DROP COLUMN IF EXISTS "base_address";
ALTER TABLE "beautician_profiles" DROP COLUMN IF EXISTS "base_lat";
ALTER TABLE "beautician_profiles" DROP COLUMN IF EXISTS "base_lng";
ALTER TABLE "beautician_profiles" DROP COLUMN IF EXISTS "service_radius_km";