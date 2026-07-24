-- Patch migration: 20260719201124_add_staff_role_and_user_role_assignment
-- was only partially applied to this database — the UserRole enum value,
-- the user_role_assignments table, and its indexes/FKs all exist, but
-- staff.user_id, its unique index, and its FK were never created. This
-- migration fills exactly that gap.
--
-- No explicit BEGIN/COMMIT — Prisma's engine already wraps this file in
-- its own transaction; see the note in the previous migration for why
-- that matters here.

ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "user_id" TEXT;

DO $$ BEGIN
  CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");
EXCEPTION
  WHEN duplicate_table THEN null; -- index already exists
END $$;

DO $$ BEGIN
  ALTER TABLE "staff"
    ADD CONSTRAINT "staff_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;