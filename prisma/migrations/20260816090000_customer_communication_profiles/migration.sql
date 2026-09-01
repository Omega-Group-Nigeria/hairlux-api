-- ============================================================================
-- Adds the CommunicationChannel enum and customer_communication_profiles
-- table -- owns ONLY consent/opt-out state per (subject, channel), never
-- channel "availability" (that stays derived from User/Customer email/
-- phone directly, checked at send time by the future send pipeline).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'SMS', 'PUSH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "customer_communication_profiles" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT,
  "user_id" TEXT,
  "channel" "CommunicationChannel" NOT NULL,
  "marketing_consent" BOOLEAN NOT NULL,
  "opted_out_at" TIMESTAMP(3),
  "opted_out_reason" TEXT,
  "last_delivery_status" TEXT,
  "last_delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_communication_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_communication_profiles_customer_id_channel_key"
  ON "customer_communication_profiles" ("customer_id", "channel");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_communication_profiles_user_id_channel_key"
  ON "customer_communication_profiles" ("user_id", "channel");
CREATE INDEX IF NOT EXISTS "customer_communication_profiles_customer_id_idx"
  ON "customer_communication_profiles" ("customer_id");
CREATE INDEX IF NOT EXISTS "customer_communication_profiles_user_id_idx"
  ON "customer_communication_profiles" ("user_id");

ALTER TABLE "customer_communication_profiles"
  ADD CONSTRAINT "customer_communication_profiles_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_communication_profiles_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;