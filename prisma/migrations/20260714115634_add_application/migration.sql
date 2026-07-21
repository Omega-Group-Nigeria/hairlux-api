-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'OFFER_EXTENDED', 'EMPLOYED', 'NOT_SELECTED');

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "applicationCode" TEXT NOT NULL,
    "jobId" TEXT,
    "appliedRole" TEXT,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "nin" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "gender" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "yearsOfExperience" TEXT,
    "previousEmployer" TEXT,
    "previousEmployerAddress" TEXT,
    "previousEmployerPhone" TEXT,
    "coverNote" TEXT NOT NULL,
    "preferredLocationId" TEXT,
    "preferredBranchText" TEXT,
    "cvUrl" TEXT,
    "portfolioUrl" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "interviewScheduledAt" TIMESTAMP(3),
    "interviewLocationId" TEXT,
    "interviewerName" TEXT,
    "interviewNote" TEXT,
    "notSelectedReason" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "staffId" TEXT,
    "employedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_applicationCode_key" ON "Application"("applicationCode");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_email_idx" ON "Application"("email");

-- CreateIndex
CREATE INDEX "Application_nin_idx" ON "Application"("nin");
