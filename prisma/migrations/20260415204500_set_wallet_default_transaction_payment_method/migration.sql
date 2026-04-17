-- Alter default after enum values are committed
ALTER TABLE "transactions" ALTER COLUMN "payment_method" SET DEFAULT 'WALLET';
