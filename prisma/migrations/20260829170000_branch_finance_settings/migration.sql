-- ============================================================================
-- Dev Feedback Round 6, item #17: admin-configurable daily revenue-
-- submission deadline (was hardcoded 12:00 / noon WAT). Singleton
-- settings row, matching payroll_settings' own pattern. No BEGIN/COMMIT,
-- matching this project's migration history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "branch_finance_settings" (
  "id" TEXT NOT NULL,
  "submission_deadline_time" TEXT NOT NULL DEFAULT '12:00',
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branch_finance_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "branch_finance_settings"
  ADD CONSTRAINT "branch_finance_settings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;