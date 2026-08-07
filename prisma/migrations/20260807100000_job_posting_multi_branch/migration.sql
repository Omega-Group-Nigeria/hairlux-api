-- ============================================================================
-- Hairlux additive migration — multi-branch job postings. The legacy
-- singular job_postings.branch_id stays untouched for backward
-- compatibility; new postings from the admin form populate this join table
-- instead, supporting more than one branch per posting. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "job_posting_branches" (
  "id" TEXT NOT NULL,
  "job_posting_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  CONSTRAINT "job_posting_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "job_posting_branches_job_posting_id_branch_id_key" ON "job_posting_branches"("job_posting_id", "branch_id");
CREATE INDEX IF NOT EXISTS "job_posting_branches_job_posting_id_idx" ON "job_posting_branches"("job_posting_id");
CREATE INDEX IF NOT EXISTS "job_posting_branches_branch_id_idx" ON "job_posting_branches"("branch_id");

DO $$ BEGIN
  ALTER TABLE "job_posting_branches" ADD CONSTRAINT "job_posting_branches_job_posting_id_fkey" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "job_posting_branches" ADD CONSTRAINT "job_posting_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;