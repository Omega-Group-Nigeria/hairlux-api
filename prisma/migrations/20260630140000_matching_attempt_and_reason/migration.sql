-- CreateEnum
CREATE TYPE "MatchingExhaustedReason" AS ENUM ('NO_CANDIDATES_IN_AREA', 'OFFERS_NOT_ACCEPTED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "matching_attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bookings" ADD COLUMN "matching_exhausted_reason" "MatchingExhaustedReason";