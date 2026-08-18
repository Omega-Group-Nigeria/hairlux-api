-- ============================================================================
-- Supports Google sign-in and verified-phone account linking:
-- - password becomes nullable (Google-signup accounts have none)
-- - google_id added (unique, nullable)
-- - phone_verified / phone_verified_at added
-- - phone becomes unique -- deduplicated first, since nothing has ever
--   enforced uniqueness on it and duplicate values may already exist.
--   For any group of users sharing the same phone, the most recently
--   updated account keeps it; older duplicates are cleared to NULL rather
--   than deleting any account or other data -- phone has never been
--   verified before this feature existed, so clearing an unverified value
--   is low-risk and the person can simply re-add and verify it later.
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "users"
  ALTER COLUMN "password" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "google_id" TEXT,
  ADD COLUMN IF NOT EXISTS "phone_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP(3);

-- Deduplicate phone before the unique constraint can be added.
UPDATE "users" a
SET "phone" = NULL
WHERE a."phone" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" b
    WHERE b."phone" = a."phone"
      AND b."id" != a."id"
      AND (b."updated_at" > a."updated_at" OR (b."updated_at" = a."updated_at" AND b."id" > a."id"))
  );

CREATE UNIQUE INDEX IF NOT EXISTS "users_google_id_key" ON "users" ("google_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users" ("phone");