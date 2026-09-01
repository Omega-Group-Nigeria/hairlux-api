-- ============================================================================
-- Fixes a schema/database drift bug: the Prisma schema declares dayOfWeek as
-- @unique on BusinessHours, so Prisma generates upsert()'s SQL assuming a
-- real unique constraint exists on day_of_week — but the actual table never
-- had one, causing every upsert (e.g. toggling a day's isOpen) to fail with
-- Postgres error 42P10 ("no unique or exclusion constraint matching the ON
-- CONFLICT specification"). Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

-- Deduplicate first — without a unique constraint, nothing has stopped more
-- than one row from existing for the same day_of_week. Keep the most
-- recently updated row per day and drop the rest, so the constraint below
-- can actually be created.
DELETE FROM "business_hours" a
USING "business_hours" b
WHERE a.day_of_week = b.day_of_week
  AND a.updated_at < b.updated_at;

-- Guards against remaining ties on identical updated_at by keeping the
-- lowest id deterministically, in case any survived the pass above.
DELETE FROM "business_hours" a
USING "business_hours" b
WHERE a.day_of_week = b.day_of_week
  AND a.id > b.id;

ALTER TABLE "business_hours"
  ADD CONSTRAINT "business_hours_day_of_week_key" UNIQUE ("day_of_week");