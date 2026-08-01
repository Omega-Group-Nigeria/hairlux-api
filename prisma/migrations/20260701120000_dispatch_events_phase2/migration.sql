-- Phase 2: dispatch audit trail + extended dispatch status

ALTER TYPE "DispatchStatus" ADD VALUE 'ASSIGNED';
ALTER TYPE "DispatchStatus" ADD VALUE 'CANCELLED';

CREATE TABLE "dispatch_events" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_events_booking_id_created_at_idx"
  ON "dispatch_events"("booking_id", "created_at");

CREATE UNIQUE INDEX "dispatch_events_idempotency_unique"
  ON "dispatch_events"("booking_id", "event_type", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "dispatch_events"
  ADD CONSTRAINT "dispatch_events_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;