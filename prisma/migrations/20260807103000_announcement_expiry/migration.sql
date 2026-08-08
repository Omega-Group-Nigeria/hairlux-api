-- ============================================================================
-- Hairlux additive migration — optional expiry date on announcements, so an
-- announcement can stop appearing in the staff portal automatically rather
-- than needing to be manually deleted. Apply via `prisma migrate deploy`.
-- No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);