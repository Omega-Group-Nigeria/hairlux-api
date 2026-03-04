-- Migration: Replace per-service FK on bookings with a JSON services array
-- This consolidates multiple service rows into a single booking record

-- Step 1: Add the new services JSONB column (default empty array for existing rows)
ALTER TABLE "bookings" ADD COLUMN "services" JSONB NOT NULL DEFAULT '[]';

-- Step 2: Drop the foreign key constraint from service_id
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_service_id_fkey";

-- Step 3: Drop the service_id column
ALTER TABLE "bookings" DROP COLUMN "service_id";

-- Step 4: Remove the default on services (Prisma manages defaults at app level)
ALTER TABLE "bookings" ALTER COLUMN "services" DROP DEFAULT;
