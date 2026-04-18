-- Add MONNIFY as a booking payment method for prepaid booking flows
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MONNIFY';
