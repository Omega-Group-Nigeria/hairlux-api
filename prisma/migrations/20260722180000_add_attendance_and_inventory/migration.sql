

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id"            TEXT NOT NULL,
  "staff_id"      TEXT NOT NULL,
  "location_id"   TEXT NOT NULL,
  "date"          DATE NOT NULL,
  "check_in_at"   TIMESTAMP(3) NOT NULL,
  "check_out_at"  TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_staff_id_date_key"
  ON "attendance_records"("staff_id", "date");

CREATE INDEX IF NOT EXISTS "attendance_records_location_id_date_idx"
  ON "attendance_records"("location_id", "date");

DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "attendance_records"
    ADD CONSTRAINT "attendance_records_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "staff_locations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InventoryEntryType" AS ENUM ('RECEIVED', 'SOLD');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "inventory_log_entries" (
  "id"           TEXT NOT NULL,
  "location_id"  TEXT NOT NULL,
  "staff_id"     TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "type"         "InventoryEntryType" NOT NULL,
  "quantity"     INTEGER NOT NULL,
  "note"         TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inventory_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "inventory_log_entries_location_id_product_name_idx"
  ON "inventory_log_entries"("location_id", "product_name");

DO $$ BEGIN
  ALTER TABLE "inventory_log_entries"
    ADD CONSTRAINT "inventory_log_entries_staff_id_fkey"
    FOREIGN KEY ("staff_id") REFERENCES "staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "inventory_log_entries"
    ADD CONSTRAINT "inventory_log_entries_location_id_fkey"
    FOREIGN KEY ("location_id") REFERENCES "staff_locations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;