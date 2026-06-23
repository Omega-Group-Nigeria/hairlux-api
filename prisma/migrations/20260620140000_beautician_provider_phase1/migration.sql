-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ProfileReviewStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('OFFLINE', 'ONLINE', 'ON_JOB');

-- CreateEnum
CREATE TYPE "JobOfferStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "PayoutMode" AS ENUM ('MANUAL', 'AUTO');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'BEAUTICIAN';

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_ASSIGNMENT';
ALTER TYPE "BookingStatus" ADD VALUE 'ASSIGNED';
ALTER TYPE "BookingStatus" ADD VALUE 'EN_ROUTE';
ALTER TYPE "BookingStatus" ADD VALUE 'ARRIVED';
ALTER TYPE "BookingStatus" ADD VALUE 'ARRIVED_VERIFIED';
ALTER TYPE "BookingStatus" ADD VALUE 'AWAITING_CUSTOMER_CONFIRM';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'SERVICE_EARNINGS';
ALTER TYPE "TransactionType" ADD VALUE 'PAYOUT_REQUEST';
ALTER TYPE "TransactionType" ADD VALUE 'PAYOUT_COMPLETED';

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN "latitude" DECIMAL(10,7),
ADD COLUMN "longitude" DECIMAL(10,7);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "assigned_beautician_user_id" TEXT,
ADD COLUMN "arrival_verified_at" TIMESTAMP(3),
ADD COLUMN "service_started_at" TIMESTAMP(3),
ADD COLUMN "service_completed_at" TIMESTAMP(3),
ADD COLUMN "beautician_arrival_lat" DECIMAL(10,7),
ADD COLUMN "beautician_arrival_lng" DECIMAL(10,7),
ADD COLUMN "customer_rating" INTEGER,
ADD COLUMN "customer_review" TEXT;

-- CreateTable
CREATE TABLE "beautician_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "bio" TEXT,
    "profile_photo_url" TEXT,
    "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "years_of_experience" INTEGER,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "base_address" TEXT,
    "base_lat" DECIMAL(10,7),
    "base_lng" DECIMAL(10,7),
    "service_radius_km" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "current_lat" DECIMAL(10,7),
    "current_lng" DECIMAL(10,7),
    "last_location_update" TIMESTAMP(3),
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'OFFLINE',
    "kyc_status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "kyc_verified_at" TIMESTAMP(3),
    "qore_id_customer_id" TEXT,
    "qore_id_session_id" TEXT,
    "profile_status" "ProfileReviewStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
    "profile_submitted_at" TIMESTAMP(3),
    "profile_reviewed_at" TIMESTAMP(3),
    "profile_reviewed_by_id" TEXT,
    "review_notes" TEXT,
    "rating_average" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "total_jobs_completed" INTEGER NOT NULL DEFAULT 0,
    "total_earnings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "commission_rate_override" DECIMAL(5,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beautician_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beautician_services" (
    "id" TEXT NOT NULL,
    "beautician_profile_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beautician_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "beautician_user_id" TEXT NOT NULL,
    "status" "JobOfferStatus" NOT NULL DEFAULT 'OFFERED',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "distance_km_at_offer" DECIMAL(8,2),
    "est_earnings_at_offer" DECIMAL(10,2),

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_service_settings" (
    "id" TEXT NOT NULL,
    "commission_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.70,
    "job_offer_timeout_minutes" INTEGER NOT NULL DEFAULT 4,
    "default_matching_radius_km" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "kyc_auto_approve" BOOLEAN NOT NULL DEFAULT true,
    "arrival_verification_expiry_minutes" INTEGER NOT NULL DEFAULT 15,
    "service_completion_buffer_minutes" INTEGER NOT NULL DEFAULT 60,
    "payout_mode" "PayoutMode" NOT NULL DEFAULT 'MANUAL',
    "arrival_geo_fence_meters" INTEGER NOT NULL DEFAULT 250,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_service_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beautician_profiles_user_id_key" ON "beautician_profiles"("user_id");

-- CreateIndex
CREATE INDEX "beautician_profiles_kyc_status_idx" ON "beautician_profiles"("kyc_status");

-- CreateIndex
CREATE INDEX "beautician_profiles_profile_status_idx" ON "beautician_profiles"("profile_status");

-- CreateIndex
CREATE INDEX "beautician_profiles_availability_status_idx" ON "beautician_profiles"("availability_status");

-- CreateIndex
CREATE INDEX "beautician_profiles_is_active_idx" ON "beautician_profiles"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "beautician_services_beautician_profile_id_service_id_key" ON "beautician_services"("beautician_profile_id", "service_id");

-- CreateIndex
CREATE INDEX "beautician_services_beautician_profile_id_idx" ON "beautician_services"("beautician_profile_id");

-- CreateIndex
CREATE INDEX "beautician_services_service_id_idx" ON "beautician_services"("service_id");

-- CreateIndex
CREATE INDEX "job_offers_booking_id_idx" ON "job_offers"("booking_id");

-- CreateIndex
CREATE INDEX "job_offers_beautician_user_id_idx" ON "job_offers"("beautician_user_id");

-- CreateIndex
CREATE INDEX "job_offers_status_idx" ON "job_offers"("status");

-- CreateIndex
CREATE INDEX "job_offers_expires_at_idx" ON "job_offers"("expires_at");

-- CreateIndex
CREATE INDEX "bookings_assigned_beautician_user_id_idx" ON "bookings"("assigned_beautician_user_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_assigned_beautician_user_id_fkey" FOREIGN KEY ("assigned_beautician_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_profiles" ADD CONSTRAINT "beautician_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_profiles" ADD CONSTRAINT "beautician_profiles_profile_reviewed_by_id_fkey" FOREIGN KEY ("profile_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_services" ADD CONSTRAINT "beautician_services_beautician_profile_id_fkey" FOREIGN KEY ("beautician_profile_id") REFERENCES "beautician_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_services" ADD CONSTRAINT "beautician_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beautician_services" ADD CONSTRAINT "beautician_services_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_beautician_user_id_fkey" FOREIGN KEY ("beautician_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;