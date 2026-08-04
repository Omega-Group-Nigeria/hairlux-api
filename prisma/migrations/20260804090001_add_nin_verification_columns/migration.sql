-- ============================================================================
-- Hairlux additive migration — Application columns for NIN verification
-- tracking (split from the enum-value migration — see the previous file's
-- comment for why), plus a new table backing a per-NIN cooldown: once a
-- verification attempt actually reaches QoreID, further attempts for that
-- NIN are rejected until the configurable cooldown window elapses. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "nin_verified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nin_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nin_photo_url" TEXT,
  ADD COLUMN IF NOT EXISTS "nin_verification_fail_reason" TEXT;

ALTER TABLE "Application"
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "address" DROP NOT NULL,
  ALTER COLUMN "email" DROP NOT NULL,
  ALTER COLUMN "coverNote" DROP NOT NULL;

-- ── NIN verification cooldown ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "nin_verification_attempts" (
  "id" TEXT NOT NULL,
  "nin" TEXT NOT NULL,
  "last_attempt_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nin_verification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nin_verification_attempts_nin_key" ON "nin_verification_attempts"("nin");