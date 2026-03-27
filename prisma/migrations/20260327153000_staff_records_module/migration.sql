-- Create staff employment enums
DO $$ BEGIN
  CREATE TYPE "StaffEmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'EXITED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "StaffEmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create staff table
CREATE TABLE IF NOT EXISTS "staff" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "staff_code" TEXT NOT NULL,
  "current_role" TEXT NOT NULL,
  "business_location" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "date_of_birth" TIMESTAMP(3),
  "employment_status" "StaffEmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason_for_exit" TEXT,
  "exit_date" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "birthday_last_emailed_year" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_staff_code_key" ON "staff"("staff_code");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_email_key" ON "staff"("email");
CREATE INDEX IF NOT EXISTS "staff_employment_status_idx" ON "staff"("employment_status");
CREATE INDEX IF NOT EXISTS "staff_business_location_idx" ON "staff"("business_location");

-- Create employment history table
CREATE TABLE IF NOT EXISTS "staff_employment_history" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "role_title" TEXT NOT NULL,
  "business_location" TEXT NOT NULL,
  "employment_type" "StaffEmploymentType" NOT NULL DEFAULT 'FULL_TIME',
  "start_date" TIMESTAMP(3) NOT NULL,
  "end_date" TIMESTAMP(3),
  "reason_for_change" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "staff_employment_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_employment_history_staff_id_start_date_idx"
  ON "staff_employment_history"("staff_id", "start_date");

DO $$ BEGIN
  ALTER TABLE "staff_employment_history"
    ADD CONSTRAINT "staff_employment_history_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
