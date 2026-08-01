-- CreateEnum
CREATE TYPE "BookingCommsEventType" AS ENUM ('CHAT_MESSAGE', 'CALL_STARTED', 'CALL_ENDED');

-- CreateTable
CREATE TABLE "booking_comms_events" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_type" "BookingCommsEventType" NOT NULL,
    "actor_user_id" TEXT,
    "stream_event_id" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_comms_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "booking_comms_events_stream_event_id_key" ON "booking_comms_events"("stream_event_id");

-- CreateIndex
CREATE INDEX "booking_comms_events_session_id_created_at_idx" ON "booking_comms_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "booking_comms_events_event_type_created_at_idx" ON "booking_comms_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "booking_comms_sessions_opened_at_idx" ON "booking_comms_sessions"("opened_at");

-- CreateIndex
CREATE INDEX "booking_comms_sessions_closed_at_idx" ON "booking_comms_sessions"("closed_at");

-- AddForeignKey
ALTER TABLE "booking_comms_events" ADD CONSTRAINT "booking_comms_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "booking_comms_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;