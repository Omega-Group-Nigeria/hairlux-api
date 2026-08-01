-- ============================================================================
-- Hairlux additive-only migration — Salon Bookings (Front Desk walk-in flow),
-- Inventory pricing, and per-Staff commission rate override.
-- Same reasoning/pattern as the migrations before it. Apply via
-- `prisma migrate deploy`. No BEGIN/COMMIT — Prisma wraps this itself.
-- ============================================================================

-- ── InventoryItem.price ──

ALTER TABLE "inventory_items"
  ADD COLUMN IF NOT EXISTS "price" DECIMAL(10, 2);

-- ── Staff.commission_rate ──

ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "commission_rate" DECIMAL(5, 4);

-- ── SalonBookingStatus enum ──

DO $$ BEGIN
  CREATE TYPE "SalonBookingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── salon_bookings ──

CREATE TABLE IF NOT EXISTS "salon_bookings" (
  "id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT,
  "assigned_staff_id" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "booking_date" DATE NOT NULL,
  "booking_time" TEXT NOT NULL,
  "status" "SalonBookingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "total_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "cancel_reason" TEXT,
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salon_bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salon_bookings_branch_id_booking_date_idx" ON "salon_bookings"("branch_id", "booking_date");
CREATE INDEX IF NOT EXISTS "salon_bookings_assigned_staff_id_status_idx" ON "salon_bookings"("assigned_staff_id", "status");

DO $$ BEGIN
  ALTER TABLE "salon_bookings" ADD CONSTRAINT "salon_bookings_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_bookings" ADD CONSTRAINT "salon_bookings_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_bookings" ADD CONSTRAINT "salon_bookings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── salon_booking_services ──

CREATE TABLE IF NOT EXISTS "salon_booking_services" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "price" DECIMAL(10, 2) NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "salon_booking_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salon_booking_services_booking_id_idx" ON "salon_booking_services"("booking_id");

DO $$ BEGIN
  ALTER TABLE "salon_booking_services" ADD CONSTRAINT "salon_booking_services_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "salon_bookings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_booking_services" ADD CONSTRAINT "salon_booking_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── salon_booking_inventory_items ──

CREATE TABLE IF NOT EXISTS "salon_booking_inventory_items" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "item_id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(10, 2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salon_booking_inventory_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salon_booking_inventory_items_booking_id_idx" ON "salon_booking_inventory_items"("booking_id");

DO $$ BEGIN
  ALTER TABLE "salon_booking_inventory_items" ADD CONSTRAINT "salon_booking_inventory_items_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "salon_bookings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_booking_inventory_items" ADD CONSTRAINT "salon_booking_inventory_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── salon_booking_commissions ──

CREATE TABLE IF NOT EXISTS "salon_booking_commissions" (
  "id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "rate_applied" DECIMAL(5, 4) NOT NULL,
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salon_booking_commissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salon_booking_commissions_staff_id_calculated_at_idx" ON "salon_booking_commissions"("staff_id", "calculated_at");

DO $$ BEGIN
  ALTER TABLE "salon_booking_commissions" ADD CONSTRAINT "salon_booking_commissions_booking_id_key" UNIQUE ("booking_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_booking_commissions" ADD CONSTRAINT "salon_booking_commissions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "salon_bookings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "salon_booking_commissions" ADD CONSTRAINT "salon_booking_commissions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;