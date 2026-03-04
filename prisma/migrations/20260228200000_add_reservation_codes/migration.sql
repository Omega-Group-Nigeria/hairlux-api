-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('HOME_SERVICE', 'WALK_IN');

-- AlterTable: add new columns (nullable first to handle existing rows)
ALTER TABLE "bookings"
  ADD COLUMN "booking_type"     "BookingType" NOT NULL DEFAULT 'HOME_SERVICE',
  ADD COLUMN "reservation_code" TEXT,
  ADD COLUMN "reservation_used" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guest_name"       TEXT,
  ADD COLUMN "guest_phone"      TEXT;

-- Make address_id nullable
ALTER TABLE "bookings" ALTER COLUMN "address_id" DROP NOT NULL;

-- Backfill reservation_code for existing rows using a short random code
UPDATE "bookings"
SET "reservation_code" = 'HLX-' || upper(substring(md5(id::text || random()::text) for 4))
WHERE "reservation_code" IS NULL;

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE "bookings" ALTER COLUMN "reservation_code" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reservation_code_key" ON "bookings"("reservation_code");
CREATE INDEX "bookings_reservation_code_idx" ON "bookings"("reservation_code");
