-- ============================================================================
-- Adds updatedAt to Announcement, needed now that announcements can be
-- edited after being sent — lets admin (and eventually staff, if ever
-- surfaced) see that a message was changed since it was first posted.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);

-- Backfill: existing rows treat their creation time as their last-updated
-- time, since nothing has edited them yet.
UPDATE "announcements" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;

ALTER TABLE "announcements"
  ALTER COLUMN "updated_at" SET NOT NULL;