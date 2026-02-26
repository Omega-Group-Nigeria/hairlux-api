/*
  Warnings:

  - You are about to drop the column `break_end_time` on the `business_settings` table. All the data in the column will be lost.
  - You are about to drop the column `break_start_time` on the `business_settings` table. All the data in the column will be lost.
  - You are about to drop the column `closing_time` on the `business_settings` table. All the data in the column will be lost.
  - You are about to drop the column `opening_time` on the `business_settings` table. All the data in the column will be lost.
  - You are about to drop the `booking_config` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "business_settings" DROP COLUMN "break_end_time",
DROP COLUMN "break_start_time",
DROP COLUMN "closing_time",
DROP COLUMN "opening_time",
ADD COLUMN     "advance_booking_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "max_bookings_per_day" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "min_notice_hours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "slot_duration" INTEGER NOT NULL DEFAULT 30;

-- DropTable
DROP TABLE "booking_config";

-- CreateTable
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_exceptions" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "open_time" TEXT,
    "close_time" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_day_of_week_key" ON "business_hours"("day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "business_exceptions_date_key" ON "business_exceptions"("date");
