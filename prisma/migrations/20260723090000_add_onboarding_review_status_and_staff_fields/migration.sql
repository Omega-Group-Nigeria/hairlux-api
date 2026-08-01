ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "reference_name" TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "reference_phone" TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "reference_relationship" TEXT;

DO $$ BEGIN
  CREATE TYPE "OnboardingItemReviewStatus" AS ENUM ('NOT_STARTED', 'SUBMITTED', 'COMPLETE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "staff_onboarding_items"
  ADD COLUMN IF NOT EXISTS "review_status" "OnboardingItemReviewStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "staff_onboarding_items" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3);


UPDATE "staff_onboarding_items" SET "review_status" = 'COMPLETE' WHERE "is_complete" = true;