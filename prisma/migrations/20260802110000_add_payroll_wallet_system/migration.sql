-- ============================================================================
-- Hairlux additive migration — Smart Payroll & Salary Wallet System.
-- Staff bank accounts, ongoing compensation history, payroll periods,
-- payslips, manual adjustments, a dedicated staff wallet/transaction ledger
-- (separate from the customer/beautician Wallet), staff payout requests
-- (mirrors the proven Beautician Paystack-transfer pattern), and the
-- Payday release toggle. Apply via `prisma migrate deploy`. No BEGIN/COMMIT.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'AWAITING_RELEASE', 'RELEASED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PayslipAdjustmentType" AS ENUM ('BONUS', 'DEDUCTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StaffWalletTransactionType" AS ENUM ('PAYROLL_CREDIT', 'WITHDRAWAL', 'WITHDRAWAL_REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StaffPayoutRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Staff current-compensation snapshot ────────────────────────────────────
ALTER TABLE "staff"
  ADD COLUMN IF NOT EXISTS "current_base_salary" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "current_allowances" DECIMAL(10,2);

-- ── Staff bank accounts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_bank_accounts" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "bank_code" TEXT NOT NULL,
  "bank_name" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_name" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "verification_ref" TEXT,
  "pending_bank_code" TEXT,
  "pending_bank_name" TEXT,
  "pending_account_number" TEXT,
  "pending_account_name" TEXT,
  "pending_requested_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_bank_accounts_staff_id_key" ON "staff_bank_accounts"("staff_id");

DO $$ BEGIN
  ALTER TABLE "staff_bank_accounts" ADD CONSTRAINT "staff_bank_accounts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Compensation history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_compensation_history" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "base_salary" DECIMAL(10,2) NOT NULL,
  "allowances" DECIMAL(10,2),
  "note" TEXT,
  "effective_date" TIMESTAMP(3) NOT NULL,
  "changed_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_compensation_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_compensation_history_staff_id_idx" ON "staff_compensation_history"("staff_id");

DO $$ BEGIN
  ALTER TABLE "staff_compensation_history" ADD CONSTRAINT "staff_compensation_history_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_compensation_history" ADD CONSTRAINT "staff_compensation_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payroll periods ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
  "generated_at" TIMESTAMP(3),
  "generated_by_id" TEXT,
  "approved_at" TIMESTAMP(3),
  "approved_by_id" TEXT,
  "released_at" TIMESTAMP(3),
  "released_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_period_start_period_end_key" ON "payroll_periods"("period_start", "period_end");

DO $$ BEGIN
  ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payslips ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payslips" (
  "id" TEXT NOT NULL,
  "payroll_period_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "base_salary" DECIMAL(10,2) NOT NULL,
  "allowances" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "overtime_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "commission_earned" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "commission_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "bonus_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "attendance_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "late_penalty_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "fine_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "loan_repayment" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "tax_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "pension_deduction" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "other_deduction_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "gross_pay" DECIMAL(10,2) NOT NULL,
  "total_deductions" DECIMAL(10,2) NOT NULL,
  "net_pay" DECIMAL(10,2) NOT NULL,
  "is_first_month" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payslips_payroll_period_id_staff_id_key" ON "payslips"("payroll_period_id", "staff_id");
CREATE INDEX IF NOT EXISTS "payslips_staff_id_idx" ON "payslips"("staff_id");

DO $$ BEGIN
  ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payslips" ADD CONSTRAINT "payslips_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Manual payroll adjustments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payroll_adjustments" (
  "id" TEXT NOT NULL,
  "payroll_period_id" TEXT NOT NULL,
  "payslip_id" TEXT,
  "staff_id" TEXT NOT NULL,
  "type" "PayslipAdjustmentType" NOT NULL,
  "category" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payroll_adjustments_staff_id_idx" ON "payroll_adjustments"("staff_id");
CREATE INDEX IF NOT EXISTS "payroll_adjustments_payroll_period_id_idx" ON "payroll_adjustments"("payroll_period_id");

DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_period_id_fkey" FOREIGN KEY ("payroll_period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Staff wallet & transactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "staff_wallets" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_wallets_staff_id_key" ON "staff_wallets"("staff_id");

DO $$ BEGIN
  ALTER TABLE "staff_wallets" ADD CONSTRAINT "staff_wallets_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "staff_wallet_transactions" (
  "id" TEXT NOT NULL,
  "wallet_id" TEXT NOT NULL,
  "type" "StaffWalletTransactionType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "reference" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_wallet_transactions_reference_key" ON "staff_wallet_transactions"("reference");
CREATE INDEX IF NOT EXISTS "staff_wallet_transactions_wallet_id_idx" ON "staff_wallet_transactions"("wallet_id");

DO $$ BEGIN
  ALTER TABLE "staff_wallet_transactions" ADD CONSTRAINT "staff_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "staff_wallets"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Staff payout requests (Paystack transfer, mirrors Beautician pattern) ───
CREATE TABLE IF NOT EXISTS "staff_payout_requests" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "status" "StaffPayoutRequestStatus" NOT NULL DEFAULT 'PENDING',
  "bank_code" TEXT NOT NULL,
  "account_number" TEXT NOT NULL,
  "account_name" TEXT,
  "processed_by_id" TEXT,
  "processed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "transaction_id" TEXT,
  "paystack_transfer_reference" TEXT,
  "paystack_transfer_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_payout_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_payout_requests_transaction_id_key" ON "staff_payout_requests"("transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_payout_requests_paystack_transfer_reference_key" ON "staff_payout_requests"("paystack_transfer_reference");
CREATE INDEX IF NOT EXISTS "staff_payout_requests_staff_id_idx" ON "staff_payout_requests"("staff_id");
CREATE INDEX IF NOT EXISTS "staff_payout_requests_status_idx" ON "staff_payout_requests"("status");

DO $$ BEGIN
  ALTER TABLE "staff_payout_requests" ADD CONSTRAINT "staff_payout_requests_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_payout_requests" ADD CONSTRAINT "staff_payout_requests_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "staff"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "staff_payout_requests" ADD CONSTRAINT "staff_payout_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "staff_wallet_transactions"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Payroll settings (singleton — the Payday switch) ────────────────────────
CREATE TABLE IF NOT EXISTS "payroll_settings" (
  "id" TEXT NOT NULL,
  "release_active" BOOLEAN NOT NULL DEFAULT false,
  "pension_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.08,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);