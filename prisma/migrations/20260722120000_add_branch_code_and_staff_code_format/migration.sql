-- Migration: add branch code + per-branch staff sequence, and migrate
-- existing staff_code values from the old random "STF-000123" format to
-- the new branch-coded "HL-{BRANCH}-{seq}" format.
--
-- This migration is written by hand (not prisma migrate diff) because the
-- backfill logic (assigning codes, ranking staff by hire order per branch)
-- cannot be auto-generated. Do not edit prisma/schema.prisma and re-run
-- `prisma migrate dev` for this change — it has already been applied to
-- schema.prisma; running migrate dev again would try to create a second,
-- conflicting migration.

BEGIN;

-- ── Step 1: add columns as nullable first ──────────────────────────────
ALTER TABLE "staff_locations" ADD COLUMN "code" VARCHAR(5);
ALTER TABLE "staff_locations" ADD COLUMN "staff_sequence" INTEGER NOT NULL DEFAULT 0;

-- ── Step 2: backfill known branches with codes ─────────────────────────
-- NOTE: if a new branch has been created between when this migration was
-- written and when it is applied, add an UPDATE line for it here before
-- running, or the NOT NULL constraint in Step 4 will fail.
UPDATE "staff_locations" SET "code" = 'IFE' WHERE "id" = 'acf28921-2f0d-4eec-b464-caab0ff29136'; -- Ile-Ife
UPDATE "staff_locations" SET "code" = 'OWD' WHERE "id" = 'd6a36e46-36d9-472c-9d31-36743464319f'; -- Owode Oyo
UPDATE "staff_locations" SET "code" = 'OLM' WHERE "id" = 'fe71d338-7763-424a-9546-9eb583080acb'; -- Academy Olomi

-- ── Step 3: rename existing staff codes to the branch-coded format ─────
-- Ranks each staff member by hire order (created_at) within their own
-- branch, so seniority within a branch is reflected in the sequence
-- number rather than assigned arbitrarily.
WITH ranked AS (
  SELECT
    id,
    location_id,
    ROW_NUMBER() OVER (PARTITION BY location_id ORDER BY created_at ASC) AS seq
  FROM "staff"
)
UPDATE "staff" s
SET "staff_code" = 'HL-' || sl."code" || '-' || LPAD(ranked.seq::text, 4, '0')
FROM ranked
JOIN "staff_locations" sl ON sl."id" = ranked.location_id
WHERE s."id" = ranked.id;

-- ── Step 4: seed each branch's running sequence counter ────────────────
-- So the NEXT hire at each branch continues numbering correctly instead
-- of restarting from 0001 and colliding with an existing code.
UPDATE "staff_locations" sl
SET "staff_sequence" = sub.max_seq
FROM (
  SELECT location_id, COUNT(*) AS max_seq
  FROM "staff"
  GROUP BY location_id
) sub
WHERE sl."id" = sub.location_id;

-- ── Step 5: enforce constraints now that every row has a code ──────────
ALTER TABLE "staff_locations" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_code_key" UNIQUE ("code");

COMMIT;