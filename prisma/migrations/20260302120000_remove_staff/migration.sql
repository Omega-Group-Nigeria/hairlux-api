-- Remove staff assignment from bookings
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_staff_id_fkey";
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "staff_id";

-- Drop staff tables
DROP TABLE IF EXISTS "staff_availability";
DROP TABLE IF EXISTS "staff";

-- Drop staff enum
DROP TYPE IF EXISTS "StaffStatus";
