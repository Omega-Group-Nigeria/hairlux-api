-- ============================================================================
-- Adds lifecycle snapshot storage (last_known_lifecycle,
-- last_lifecycle_checked_at) to both users and customers, plus a new
-- customer_lifecycle_transitions table -- the foundation for the
-- Automated Lifecycle Campaigns feature. Lifecycle itself is still always
-- computed fresh everywhere it's currently displayed (Customer Contacts,
-- Users pages) -- these columns exist solely to give the new daily
-- CustomerLifecycleService cron a "previous value" to detect a transition
-- against, since nothing else stores one today.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_known_lifecycle" TEXT,
  ADD COLUMN IF NOT EXISTS "last_lifecycle_checked_at" TIMESTAMP(3);

ALTER TABLE "customers"
  ADD COLUMN IF NOT EXISTS "last_known_lifecycle" TEXT,
  ADD COLUMN IF NOT EXISTS "last_lifecycle_checked_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "customer_lifecycle_transitions" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT,
  "user_id" TEXT,
  "from_lifecycle" TEXT NOT NULL,
  "to_lifecycle" TEXT NOT NULL,
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "customer_lifecycle_transitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_lifecycle_transitions_customer_id_idx" ON "customer_lifecycle_transitions" ("customer_id");
CREATE INDEX IF NOT EXISTS "customer_lifecycle_transitions_user_id_idx" ON "customer_lifecycle_transitions" ("user_id");
CREATE INDEX IF NOT EXISTS "customer_lifecycle_transitions_processed_at_idx" ON "customer_lifecycle_transitions" ("processed_at");

ALTER TABLE "customer_lifecycle_transitions"
  ADD CONSTRAINT "customer_lifecycle_transitions_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_lifecycle_transitions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;