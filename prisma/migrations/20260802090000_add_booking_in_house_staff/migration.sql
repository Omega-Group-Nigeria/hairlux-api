-- ============================================================================
-- Hairlux additive migration — bookings.assigned_in_house_staff_id. Records
-- which in-house Stylist actually served a customer for a WALK_IN
-- reservation on the legacy marketplace Booking table (customer self-service
-- bookings still use this table). Deliberately separate from
-- assigned_beautician_user_id, which is the marketplace dispatch concept
-- (points at a Beautician's User account) — this points at Staff.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "assigned_in_house_staff_id" TEXT;

CREATE INDEX IF NOT EXISTS "bookings_assigned_in_house_staff_id_idx" ON "bookings"("assigned_in_house_staff_id");

DO $$ BEGIN
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_in_house_staff_id_fkey" FOREIGN KEY ("assigned_in_house_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;