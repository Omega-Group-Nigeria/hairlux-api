-- ============================================================================
-- Dev Feedback Round 9: Staff Payout was creating a brand-new Paystack
-- Transfer Recipient on every single withdrawal instead of once per bank
-- account -- this column lets it cache the recipient code the same way
-- the Beautician payout module already does (paystackRecipientCode on its
-- own bank-account table). Nullable: existing rows start without one and
-- fall back to creating a recipient on demand at withdrawal time, same as
-- the old behavior, until they're naturally backfilled (either by editing
-- the bank account, which re-triggers creation, or by that on-demand
-- fallback persisting the code back once it's created).
-- IF NOT EXISTS guards this the same way the rest of this project's
-- migration history does. No BEGIN/COMMIT, matching convention.
-- ============================================================================

ALTER TABLE "staff_bank_accounts" ADD COLUMN IF NOT EXISTS "paystack_recipient_code" TEXT;