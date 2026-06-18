-- staff_locations (and services) must have a PRIMARY KEY on id for FK targets.
-- Some environments lost PKs due to schema drift; restore before adding branch FKs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'staff_locations'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE "staff_locations"
      ADD CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'services'
      AND c.contype = 'p'
  ) THEN
    ALTER TABLE "services"
      ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "branch_services" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "walk_in_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_services_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "branch_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_services_branch_id_idx" ON "branch_services"("branch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "branch_services_service_id_idx" ON "branch_services"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "branch_services_branch_id_service_id_key" ON "branch_services"("branch_id", "service_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_services_branch_id_fkey'
  ) THEN
    ALTER TABLE "branch_services"
      ADD CONSTRAINT "branch_services_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'branch_services_service_id_fkey'
  ) THEN
    ALTER TABLE "branch_services"
      ADD CONSTRAINT "branch_services_service_id_fkey"
      FOREIGN KEY ("service_id") REFERENCES "services"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_branch_id_fkey'
  ) THEN
    ALTER TABLE "bookings"
      ADD CONSTRAINT "bookings_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;