/**
 * One-off repair for booking payments stuck in FAILED after expiry,
 * even though Monnify confirmed the payment.
 *
 * It resets the intent status back to PENDING so that re-delivering the
 * webhook (or calling verifyBookingPayment) can create the booking.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register src/scripts/fix-stuck-booking-payment.ts BOOKPAY-MONF-F07FD092E189CDB0D4413E29
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, TransactionStatus } from '@prisma/client';
import { Pool } from 'pg';

const REFERENCE = process.argv[2];

async function main() {
  if (!REFERENCE) {
    console.error('Usage: ts-node src/scripts/fix-stuck-booking-payment.ts <reference>');
    process.exit(1);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const tx = await prisma.transaction.findUnique({
      where: { reference: REFERENCE },
    });

    if (!tx) {
      console.error(`Transaction not found: ${REFERENCE}`);
      return;
    }

    const meta = (tx.metadata as Record<string, any>) ?? {};
    console.log('Before:', {
      status: tx.status,
      type: tx.type,
      gatewayPaymentStatus: meta.gatewayPaymentStatus,
      bookingId: meta.bookingId ?? null,
      transactionReference: meta.monnifyTransactionReference ?? null,
    });

    if (tx.status === TransactionStatus.PENDING) {
      console.log('Already PENDING — just resend the Monnify webhook.');
      return;
    }

    if (tx.status === TransactionStatus.COMPLETED || meta.bookingId) {
      console.log('Already completed / has a booking — nothing to do.');
      return;
    }

    if (meta.gatewayPaymentStatus !== 'PAID') {
      console.error(
        'SAFETY STOP: gatewayPaymentStatus is not PAID. Manual review required before resetting.',
      );
      process.exit(1);
    }

    await prisma.transaction.update({
      where: { reference: REFERENCE },
      data: { status: TransactionStatus.PENDING },
    });

    console.log(
      `Reset ${REFERENCE} -> PENDING. Now resend the Monnify webhook to create the booking.`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});