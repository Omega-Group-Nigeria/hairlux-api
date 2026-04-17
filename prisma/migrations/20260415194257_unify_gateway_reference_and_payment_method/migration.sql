/*
  Warnings:

  - You are about to drop the column `monnify_reference` on the `transactions` table. All the data in the column will be lost.
  - You are about to drop the column `paystack_reference` on the `transactions` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionPaymentMethod" AS ENUM ('PAYSTACK', 'MONNIFY');

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "monnify_reference",
DROP COLUMN "paystack_reference",
ADD COLUMN     "payment_method" "TransactionPaymentMethod" NOT NULL DEFAULT 'PAYSTACK';
