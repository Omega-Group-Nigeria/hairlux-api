-- ============================================================================
-- Homepage "Trusted by Thousands" stats: admin-configurable overrides on
-- top of live-computed defaults. All nullable -- null means "use the
-- live-computed count". No BEGIN/COMMIT, matching this project's
-- migration history.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "site_stats" (
  "id" TEXT NOT NULL,
  "completed_bookings_override" INTEGER,
  "registered_customers_override" INTEGER,
  "average_rating_override" DECIMAL(2,1),
  "branches_override" INTEGER,
  "professionals_override" INTEGER,
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "site_stats_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "site_stats"
  ADD CONSTRAINT "site_stats_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;