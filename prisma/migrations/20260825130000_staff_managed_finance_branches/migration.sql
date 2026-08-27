-- ============================================================================
-- Dev Feedback Round 4, item #25: multi-branch manager support for
-- Branch Finance -- a separate, additive many-to-many, not a change to
-- the existing single-manager-per-branch StaffLocation.managerId.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "staff_managed_finance_branches" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_managed_finance_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_managed_finance_branches_staff_id_branch_id_key" ON "staff_managed_finance_branches" ("staff_id", "branch_id");
CREATE INDEX IF NOT EXISTS "staff_managed_finance_branches_staff_id_idx" ON "staff_managed_finance_branches" ("staff_id");
CREATE INDEX IF NOT EXISTS "staff_managed_finance_branches_branch_id_idx" ON "staff_managed_finance_branches" ("branch_id");

ALTER TABLE "staff_managed_finance_branches"
  ADD CONSTRAINT "staff_managed_finance_branches_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staff_managed_finance_branches_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;