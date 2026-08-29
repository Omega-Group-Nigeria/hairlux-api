-- ============================================================================
-- Dev Feedback Round 5, item #2: "allow custom document types for
-- uploads." Converts CompanyDocument.type from a fixed enum to a proper
-- foreign key against a new, admin-manageable DocumentType table. The 6
-- original enum values are seeded here as isSystem rows -- kept, never
-- deletable, since existing CompanyDocument/acknowledgment data still
-- references them; an admin can add further custom types afterward. No
-- BEGIN/COMMIT, matching this project's migration history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "document_types" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_types_name_key" ON "document_types" ("name");

-- Seed the 6 original values as isSystem rows, using the same human-
-- readable labels the frontend already displays for each -- so an admin
-- sees no difference from a genuinely custom type once this migrates.
INSERT INTO "document_types" ("id", "name", "is_system", "is_active")
VALUES
  (gen_random_uuid()::text, 'Employment Contract', true, true),
  (gen_random_uuid()::text, 'Confidentiality Agreement (NDA)', true, true),
  (gen_random_uuid()::text, 'IT & Acceptable Use Policy', true, true),
  (gen_random_uuid()::text, 'Staff Handbook', true, true),
  (gen_random_uuid()::text, 'Code of Conduct', true, true),
  (gen_random_uuid()::text, 'Data Protection & Privacy Policy', true, true)
ON CONFLICT ("name") DO NOTHING;

-- Nullable at first -- backfilled below, then made required once every
-- existing row has a value.
ALTER TABLE "company_documents" ADD COLUMN IF NOT EXISTS "document_type_id" TEXT;

UPDATE "company_documents" SET "document_type_id" = (
  SELECT "id" FROM "document_types" WHERE "name" = CASE "company_documents"."type"
    WHEN 'EMPLOYMENT_CONTRACT' THEN 'Employment Contract'
    WHEN 'NDA' THEN 'Confidentiality Agreement (NDA)'
    WHEN 'IT_ACCEPTABLE_USE_POLICY' THEN 'IT & Acceptable Use Policy'
    WHEN 'STAFF_HANDBOOK' THEN 'Staff Handbook'
    WHEN 'CODE_OF_CONDUCT' THEN 'Code of Conduct'
    WHEN 'DATA_PROTECTION_POLICY' THEN 'Data Protection & Privacy Policy'
  END
) WHERE "document_type_id" IS NULL;

ALTER TABLE "company_documents" ALTER COLUMN "document_type_id" SET NOT NULL;

ALTER TABLE "company_documents"
  ADD CONSTRAINT "company_documents_document_type_id_fkey"
    FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "company_documents" DROP COLUMN IF EXISTS "type";

DROP TYPE IF EXISTS "CompanyDocumentType";