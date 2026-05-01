ALTER TABLE "bookings" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key"
  ON "bookings" ("user_id", "idempotency_key");
