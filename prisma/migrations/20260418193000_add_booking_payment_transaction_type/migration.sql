-- Add transaction classification for direct booking payments (gateway -> booking path)
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BOOKING_PAYMENT';
