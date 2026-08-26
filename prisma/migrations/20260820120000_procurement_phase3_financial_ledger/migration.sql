-- ============================================================================
-- Procurement, Inventory & Finance Integration — Phase 3: centralized
-- Financial Transaction ledger. A genuinely new, source-agnostic
-- inflow/outflow model -- NOT an extension of the existing, customer-
-- wallet-scoped Transaction model. Empty until wired up in subsequent
-- steps of this same phase (product sales, salon booking revenue,
-- wallet funding) and later phases (Purchase payments).
-- Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "FinancialTransactionDirection" AS ENUM ('INFLOW', 'OUTFLOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "FinancialTransactionCategory" AS ENUM (
    'SALON_BOOKING_REVENUE', 'PRODUCT_SALE', 'ACADEMY_PAYMENT', 'MEMBERSHIP_PAYMENT', 'WALLET_FUNDING', 'OTHER_INCOME',
    'VENDOR_PAYMENT', 'SALARY', 'REFUND', 'OPERATIONAL_EXPENSE', 'LOGISTICS', 'OTHER_EXPENSE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "financial_transactions" (
  "id" TEXT NOT NULL,
  "sequence_number" SERIAL,
  "reference" TEXT NOT NULL,
  "direction" "FinancialTransactionDirection" NOT NULL,
  "category" "FinancialTransactionCategory" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "branch_id" TEXT,
  "description" TEXT,
  "payment_method" TEXT,
  "recorded_by_id" TEXT,
  "source_type" TEXT,
  "source_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_reference_key" ON "financial_transactions" ("reference");
CREATE INDEX IF NOT EXISTS "financial_transactions_direction_created_at_idx" ON "financial_transactions" ("direction", "created_at");
CREATE INDEX IF NOT EXISTS "financial_transactions_category_idx" ON "financial_transactions" ("category");
CREATE INDEX IF NOT EXISTS "financial_transactions_branch_id_idx" ON "financial_transactions" ("branch_id");
CREATE INDEX IF NOT EXISTS "financial_transactions_source_type_source_id_idx" ON "financial_transactions" ("source_type", "source_id");

ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "staff_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "financial_transactions_recorded_by_id_fkey"
    FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;