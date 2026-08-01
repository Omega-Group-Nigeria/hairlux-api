-- CreateEnum
CREATE TYPE "BookingCommsSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookingCommsCloseReason" AS ENUM ('CUSTOMER_CONFIRMED', 'AUTO_FINALIZED', 'CANCELLED', 'REASSIGNED');

-- CreateTable
CREATE TABLE "booking_comms_sessions" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "stream_channel_id" TEXT NOT NULL,
    "stream_call_cid" TEXT,
    "customer_user_id" TEXT NOT NULL,
    "beautician_user_id" TEXT NOT NULL,
    "status" "BookingCommsSessionStatus" NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "close_reason" "BookingCommsCloseReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_comms_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_comms_sessions_booking_id_key" ON "booking_comms_sessions"("booking_id");

-- CreateIndex
CREATE INDEX "booking_comms_sessions_customer_user_id_idx" ON "booking_comms_sessions"("customer_user_id");

-- CreateIndex
CREATE INDEX "booking_comms_sessions_beautician_user_id_idx" ON "booking_comms_sessions"("beautician_user_id");

-- CreateIndex
CREATE INDEX "booking_comms_sessions_status_idx" ON "booking_comms_sessions"("status");

-- AddForeignKey
ALTER TABLE "booking_comms_sessions" ADD CONSTRAINT "booking_comms_sessions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;