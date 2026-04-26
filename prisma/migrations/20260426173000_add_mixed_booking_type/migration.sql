-- Add MIXED booking type to support per-service mode in a single booking
ALTER TYPE "BookingType" ADD VALUE IF NOT EXISTS 'MIXED';
