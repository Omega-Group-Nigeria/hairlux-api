-- ============================================================================
-- Adds due_date, evidence_url, and updated_at to directives, for the Tasks &
-- Directives overhaul (due dates, staff-submitted evidence, edit auditing).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "directives"
  ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "evidence_url" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

-- Backfill existing rows so updated_at is never null going forward —
-- created_at is the best available approximation for anything predating
-- this column.
UPDATE "directives" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "directives" ALTER COLUMN "updated_at" SET NOT NULL;