ALTER TYPE "ProfileReviewStatus" ADD VALUE IF NOT EXISTS 'AWAITING_VIDEO';
ALTER TABLE "beautician_profiles" ADD COLUMN IF NOT EXISTS "kyc_video_key" TEXT;
