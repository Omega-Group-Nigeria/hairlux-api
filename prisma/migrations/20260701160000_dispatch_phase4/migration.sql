-- Phase 4: scoring edge cases + expanded exhaustion reasons

ALTER TYPE "MatchingExhaustedReason" ADD VALUE 'NO_BEAUTICIANS_ONLINE';
ALTER TYPE "MatchingExhaustedReason" ADD VALUE 'COVERAGE_GAP';

ALTER TABLE "beautician_profiles"
  ADD COLUMN "max_travel_radius_km" DECIMAL(6, 2);