-- Migration: Phase 2C digital agreements.
-- Adds a versioned company-document table (contract, NDA, IT policy,
-- handbook, code of conduct, data protection policy), a per-staff
-- acknowledgment table with timestamp + IP capture, and a new
-- POLICY_ACKNOWLEDGMENT onboarding item type. That item is marked complete
-- by the application (not an admin manually) the moment a staff member has
-- acknowledged every currently-active document -- see
-- StaffService.checkAndCompletePolicyAcknowledgment().
--
-- No explicit BEGIN/COMMIT -- Prisma wraps this file in its own
-- transaction already. Postgres's own "ADD VALUE IF NOT EXISTS" handles the
-- enum-value idempotency case directly, so no extra DO $$ wrapper is needed.

ALTER TYPE "OnboardingItemType" ADD VALUE IF NOT EXISTS 'POLICY_ACKNOWLEDGMENT';

DO $$ BEGIN
  CREATE TYPE "CompanyDocumentType" AS ENUM (
    'EMPLOYMENT_CONTRACT',
    'NDA',
    'IT_ACCEPTABLE_USE_POLICY',
    'STAFF_HANDBOOK',
    'CODE_OF_CONDUCT',
    'DATA_PROTECTION_POLICY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "company_documents" (
  "id"          TEXT NOT NULL,
  "type"        "CompanyDocumentType" NOT NULL,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "title"       TEXT NOT NULL,
  "content_url" TEXT NOT NULL,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "company_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "staff_document_acknowledgments" (
  "id"              TEXT NOT NULL,
  "staff_id"        TEXT NOT NULL,
  "document_id"     TEXT NOT NULL,
  "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"      TEXT,
  "user_agent"      TEXT,

  CONSTRAINT "staff_document_acknowledgments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_document_acknowledgments_staff_id_document_id_key"
  ON "staff_document_acknowledgments"("staff_id", "document_id");

DO $$ BEGIN
  ALTER TABLE "staff_document_acknowledgments"
    ADD CONSTRAINT "staff_document_acknowledgments_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "staff_document_acknowledgments"
    ADD CONSTRAINT "staff_document_acknowledgments_document_id_fkey"
    FOREIGN KEY ("document_id") REFERENCES "company_documents"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;