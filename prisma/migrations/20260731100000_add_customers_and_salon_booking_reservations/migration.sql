-- ============================================================================
-- Hairlux additive migration — Customer tracking + SalonBooking reservation
-- code support (advance walk-in reservations from hairlux-user-interface,
-- verified in-branch by staff/admin). Same reasoning/pattern as the
-- migrations before it. Apply via `prisma migrate deploy`. No BEGIN/COMMIT —
-- Prisma wraps this itself.
--
-- The one non-purely-additive change: salon_bookings.assigned_staff_id
-- becomes nullable, since a reservation made from home doesn't have a
-- Stylist assigned until the customer walks in and staff verifies the code.
-- Existing rows are unaffected (they already all have a value).
-- ============================================================================

-- ── customers ──

CREATE TABLE IF NOT EXISTS "customers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_phone_key" UNIQUE ("phone");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_key" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── salon_bookings: reservation support ──

ALTER TABLE "salon_bookings"
  ADD COLUMN IF NOT EXISTS "customer_id" TEXT,
  ADD COLUMN IF NOT EXISTS "reservation_code" TEXT,
  ADD COLUMN IF NOT EXISTS "reservation_used" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "salon_bookings" ALTER COLUMN "assigned_staff_id" DROP NOT NULL;
ALTER TABLE "salon_bookings" ALTER COLUMN "created_by_id" DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE "salon_bookings" ADD CONSTRAINT "salon_bookings_reservation_code_key" UNIQUE ("reservation_code");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_bookings" ADD CONSTRAINT "salon_bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;