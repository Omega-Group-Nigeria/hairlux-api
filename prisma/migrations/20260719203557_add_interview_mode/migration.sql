-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('IN_PERSON', 'VIRTUAL');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "interviewMeetingUrl" TEXT,
ADD COLUMN     "interviewMode" "InterviewMode";

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_interviewLocationId_fkey" FOREIGN KEY ("interviewLocationId") REFERENCES "staff_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
