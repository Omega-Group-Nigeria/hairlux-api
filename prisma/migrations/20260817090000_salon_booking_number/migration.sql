-- ============================================================================
-- Hairlux additive migration — adds a sequential, always-present Booking ID
-- to SalonBooking, distinct from reservationCode (a verification token,
-- optional, only set for advance reservations). Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS "salon_bookings_booking_number_seq";

ALTER TABLE "salon_bookings"
  ADD COLUMN IF NOT EXISTS "booking_number" INTEGER;

ALTER TABLE "salon_bookings"
  ALTER COLUMN "booking_number" SET DEFAULT nextval('salon_bookings_booking_number_seq');

-- Backfill existing rows in creation order, so historical bookings get a
-- sensible, ordered Booking ID rather than all sharing one value.
DO $$
DECLARE
  r RECORD;
  n INTEGER := 1;
BEGIN
  FOR r IN SELECT id FROM "salon_bookings" WHERE "booking_number" IS NULL ORDER BY "booking_date", "booking_time"
  LOOP
    UPDATE "salon_bookings" SET "booking_number" = n WHERE id = r.id;
    n := n + 1;
  END LOOP;
  PERFORM setval('salon_bookings_booking_number_seq', GREATEST(n, 1));
END $$;

ALTER TABLE "salon_bookings"
  ALTER COLUMN "booking_number" SET NOT NULL;

ALTER TABLE "salon_bookings"
  ADD CONSTRAINT "salon_bookings_booking_number_key" UNIQUE ("booking_number");