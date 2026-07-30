-- ============================================================================
-- Hairlux additive-only migration — Disciplinary Actions
-- Hand-written for the same reason as the two before it: the pre-existing
-- constraint/index drift on unrelated tables makes `migrate dev` refuse to
-- run. Apply via `prisma migrate deploy`.
--
-- No BEGIN/COMMIT — Prisma's migrate engine wraps every migration file in
-- its own transaction already.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "DisciplinaryActionType" AS ENUM ('VERBAL_WARNING', 'WRITTEN_WARNING', 'SUSPENSION', 'TERMINATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DisciplinaryActionStatus" AS ENUM ('ACTIVE', 'APPEALED', 'OVERTURNED', 'UPHELD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "disciplinary_actions" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "actor_id" TEXT,
  "type" "DisciplinaryActionType" NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "DisciplinaryActionStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "disciplinary_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "disciplinary_actions_staff_id_created_at_idx" ON "disciplinary_actions"("staff_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "disciplinary_actions"
    ADD CONSTRAINT "disciplinary_actions_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "disciplinary_actions"
    ADD CONSTRAINT "disciplinary_actions_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
