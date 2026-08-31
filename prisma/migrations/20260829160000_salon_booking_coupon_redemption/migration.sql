-- ============================================================================
-- Dev Feedback Round 6, item #15: coupon redemption for walk-in
-- customers in Salon Booking. Direct fields on SalonBooking (not a
-- separate usage model) -- one coupon per booking, matching the
-- marketplace side's own DiscountUsage.bookingId unique constraint.
-- No BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

ALTER TABLE "salon_bookings" ADD COLUMN IF NOT EXISTS "discount_code_id" TEXT;
ALTER TABLE "salon_bookings" ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(10,2);

ALTER TABLE "salon_bookings"
  ADD CONSTRAINT "salon_bookings_discount_code_id_fkey"
    FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;