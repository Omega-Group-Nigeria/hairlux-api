-- Backfill transaction payment_method values for existing rows
-- 1) Referral-like transactions
UPDATE "transactions"
SET "payment_method" = 'REFERRAL'
WHERE "type" = 'INFLUENCER_REWARD'
   OR "reference" LIKE 'REFERRAL-%'
   OR "reference" LIKE 'INFL-REWARD-%';

-- 2) Deposits by gateway
UPDATE "transactions"
SET "payment_method" = 'MONNIFY'
WHERE "type" = 'DEPOSIT'
  AND (
    "reference" LIKE 'WALLET-MONF-%'
    OR "metadata"::text ILIKE '%"provider":"monnify"%'
    OR "metadata"::text ILIKE '%"monnifyTransactionReference"%'
  );

UPDATE "transactions"
SET "payment_method" = 'PAYSTACK'
WHERE "type" = 'DEPOSIT'
  AND "payment_method" <> 'MONNIFY';

-- 3) Remaining non-deposit operational wallet transactions
UPDATE "transactions"
SET "payment_method" = 'WALLET'
WHERE "type" <> 'DEPOSIT'
  AND "payment_method" <> 'REFERRAL';
