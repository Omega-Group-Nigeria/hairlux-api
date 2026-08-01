ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "responsibilities" TEXT;
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "reporting_to_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "staff"
    ADD CONSTRAINT "staff_reporting_to_id_fkey"
    FOREIGN KEY ("reporting_to_id") REFERENCES "staff"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementTarget" AS ENUM ('ALL', 'BRANCH', 'INDIVIDUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "announcements" (
  "id"                 TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "body"               TEXT NOT NULL,
  "target"             "AnnouncementTarget" NOT NULL,
  "target_location_id" TEXT,
  "target_staff_id"    TEXT,
  "created_by_id"      TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "announcements_target_idx" ON "announcements"("target");

DO $$ BEGIN
  ALTER TABLE "announcements"
    ADD CONSTRAINT "announcements_target_location_id_fkey"
    FOREIGN KEY ("target_location_id") REFERENCES "staff_locations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcements"
    ADD CONSTRAINT "announcements_target_staff_id_fkey"
    FOREIGN KEY ("target_staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "announcement_reads" (
  "id"              TEXT NOT NULL,
  "announcement_id" TEXT NOT NULL,
  "staff_id"        TEXT NOT NULL,
  "read_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "announcement_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "announcement_reads_announcement_id_staff_id_key"
  ON "announcement_reads"("announcement_id", "staff_id");

DO $$ BEGIN
  ALTER TABLE "announcement_reads"
    ADD CONSTRAINT "announcement_reads_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "announcement_reads"
    ADD CONSTRAINT "announcement_reads_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DirectiveStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "directives" (
  "id"              TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "body"            TEXT NOT NULL,
  "status"          "DirectiveStatus" NOT NULL DEFAULT 'PENDING',
  "target_staff_id" TEXT NOT NULL,
  "created_by_id"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responded_at"    TIMESTAMP(3),

  CONSTRAINT "directives_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "directives_target_staff_id_status_idx"
  ON "directives"("target_staff_id", "status");

DO $$ BEGIN
  ALTER TABLE "directives"
    ADD CONSTRAINT "directives_target_staff_id_fkey"
    FOREIGN KEY ("target_staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;