-- Migration: add staff onboarding checklist table, and extend the Staff
-- profile with guarantor, emergency contact, and passport photo fields.
-- Purely additive — no existing data is modified, so this is safe to run
-- without a backfill step. All new columns are nullable; existing Staff
-- rows simply have NULL until an admin/staff member fills them in.
--
-- No explicit BEGIN/COMMIT here — Prisma's migration engine already wraps
-- each migration file in its own transaction; this repo's other migrations
-- never add their own on top of that (see 20260327153000_staff_records_module
-- for the same DO $$ ... EXCEPTION pattern used below, without an outer
-- transaction wrapper).

-- ── Onboarding item type enum ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "OnboardingItemType" AS ENUM (
    'GUARANTOR_VERIFICATION',
    'EMERGENCY_CONTACT',
    'REFERENCE_CHECK',
    'ADDRESS_VERIFICATION',
    'PASSPORT_PHOTO'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Onboarding checklist table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_onboarding_items" (
  "id"           TEXT NOT NULL,
  "staff_id"     TEXT NOT NULL,
  "type"         "OnboardingItemType" NOT NULL,
  "is_complete"  BOOLEAN NOT NULL DEFAULT false,
  "completed_at" TIMESTAMP(3),
  "completed_by" TEXT,
  "notes"        TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "staff_onboarding_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_onboarding_items_staff_id_type_key"
  ON "staff_onboarding_items"("staff_id", "type");

DO $$ BEGIN
  ALTER TABLE "staff_onboarding_items"
    ADD CONSTRAINT "staff_onboarding_items_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ── Staff profile extension columns ─────────────────────────────────────
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "passport_photo_url"         TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "emergency_contact_name"     TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "emergency_contact_phone"    TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "emergency_contact_relation" TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "guarantor_name"              TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "guarantor_occupation"        TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "guarantor_phone"             TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "guarantor_address"           TEXT;