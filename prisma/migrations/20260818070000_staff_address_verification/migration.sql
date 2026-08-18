-- ============================================================================
-- Adds AddressVerificationStatus enum and staff_address_verifications --
-- the QoreID Physical Address Verification Pro feature. One row per
-- staff member (unique staff_id): admin requests it, staff submits the
-- form (street/city/GPS/building details + up to 3 photos) from the
-- Staff Portal, QoreID's field-agent network verifies it physically
-- (24-48h), and the result arrives via webhook.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "AddressVerificationStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "staff_address_verifications" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "status" "AddressVerificationStatus" NOT NULL DEFAULT 'REQUESTED',
  "requested_by_id" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "street" TEXT,
  "city" TEXT,
  "lga_name" TEXT,
  "state_name" TEXT,
  "landmark" TEXT,
  "house_number" TEXT,
  "general_description" TEXT,
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "building_description" TEXT,
  "has_gate_and_fence" BOOLEAN,
  "building_status" TEXT,
  "building_type" TEXT,
  "building_colour" TEXT,
  "photo1_key" TEXT,
  "photo2_key" TEXT,
  "photo3_key" TEXT,
  "submitted_at" TIMESTAMP(3),

  "qoreid_verification_id" TEXT,
  "qoreid_status" TEXT,
  "qoreid_sub_status" TEXT,
  "qoreid_state" TEXT,
  "report_url" TEXT,
  "result_received_at" TIMESTAMP(3),

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_address_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_address_verifications_staff_id_key" ON "staff_address_verifications" ("staff_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_address_verifications_qoreid_verification_id_key" ON "staff_address_verifications" ("qoreid_verification_id");
CREATE INDEX IF NOT EXISTS "staff_address_verifications_staff_id_idx" ON "staff_address_verifications" ("staff_id");
CREATE INDEX IF NOT EXISTS "staff_address_verifications_status_idx" ON "staff_address_verifications" ("status");

ALTER TABLE "staff_address_verifications"
  ADD CONSTRAINT "staff_address_verifications_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_address_verifications_requested_by_id_fkey"
    FOREIGN KEY ("requested_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;