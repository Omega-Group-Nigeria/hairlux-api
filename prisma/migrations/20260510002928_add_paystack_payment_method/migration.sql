-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'PAYSTACK';

-- DropIndex
DROP INDEX "addresses_user_id_is_default_idx";