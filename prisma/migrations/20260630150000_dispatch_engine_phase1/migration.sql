-- Phase 1: sequential dispatch offers

-- Beautician can be in OFFERED state while a job offer is pending
ALTER TYPE "AvailabilityStatus" ADD VALUE 'OFFERED';

-- Offer cancelled when beautician goes offline before responding
ALTER TYPE "JobOfferStatus" ADD VALUE 'CANCELLED';

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM (
  'PENDING_MATCH',
  'OFFERING',
  'MATCH_EXHAUSTED'
);

-- job_offers: tier tracking + audit snapshot
ALTER TABLE "job_offers" ADD COLUMN "tier" SMALLINT;
ALTER TABLE "job_offers" ADD COLUMN "score_snapshot" JSONB;
ALTER TABLE "job_offers" ADD COLUMN "decline_reason" TEXT;

-- bookings: dispatch tracking
ALTER TABLE "bookings" ADD COLUMN "matching_started_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "dispatch_status" "DispatchStatus";

-- Only one active offer per booking (sequential dispatch)
CREATE UNIQUE INDEX "job_offers_one_offered_per_booking"
  ON "job_offers" ("booking_id")
  WHERE "status" = 'OFFERED';