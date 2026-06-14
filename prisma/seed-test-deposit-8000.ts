import 'dotenv/config';
import {
  PrismaClient,
  TransactionPaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const USER_ID = '2dba902b-a036-4731-9413-07f65bbdefc0';
const AMOUNT_NGN = 8000;
const REFERENCE = 'test-deposit-8000-2dba902b-a036-4731-9413-07f65bbdefc0';
const DESCRIPTION =
  'TEST deposit of NGN 8000 for user 2dba902b-a036-4731-9413-07f65bbdefc0';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: USER_ID },
    select: { id: true },
  });

  if (!user) {
    throw new Error(`User not found for id: ${USER_ID}`);
  }

  const existingTransaction = await prisma.transaction.findUnique({
    where: { reference: REFERENCE },
    select: { id: true },
  });

  if (existingTransaction) {
    console.log('Test deposit already exists. No action taken.');
    console.log(`Reference: ${REFERENCE}`);
    return;
  }

  const wallet = await prisma.wallet.upsert({
    where: { userId: USER_ID },
    update: {},
    create: {
      userId: USER_ID,
      balance: 0,
    },
    select: {
      id: true,
      balance: true,
    },
  });

  await prisma.$transaction([
    prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: {
          increment: AMOUNT_NGN,
        },
      },
    }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        type: TransactionType.DEPOSIT,
        amount: AMOUNT_NGN,
        status: TransactionStatus.COMPLETED,
        paymentMethod: TransactionPaymentMethod.MONNIFY,
        reference: REFERENCE,
        description: DESCRIPTION,
        metadata: {
          test: true,
          action: 'seed-test-deposit',
          amountNgn: AMOUNT_NGN,
          userId: USER_ID,
        },
      },
    }),
  ]);

  const updatedWallet = await prisma.wallet.findUnique({
    where: { id: wallet.id },
    select: { balance: true },
  });

  console.log('Test deposit completed successfully.');
  console.log(`User ID: ${USER_ID}`);
  console.log(`Amount (NGN): ${AMOUNT_NGN}`);
  console.log(`Reference: ${REFERENCE}`);
  console.log(
    `Wallet balance is now: ${updatedWallet?.balance?.toString() ?? 'N/A'}`,
  );
}

main()
  .catch((error) => {
    console.error('Failed to run test deposit seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
