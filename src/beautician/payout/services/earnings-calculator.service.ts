import { Injectable } from '@nestjs/common';
import { BookingType } from '@prisma/client';
import {
  BookingServiceRecord,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { sumHomeServiceAmount } from '../../matching/utils/booking-assignment.utils';

export interface EarningsCalculationInput {
  bookingType: BookingType;
  services: unknown;
  totalAmount: number;
  commissionRate: number;
  commissionRateOverride?: number | null;
}

export interface EarningsCalculationResult {
  commissionRate: number;
  earningsBaseAmount: number;
  earningsAmount: number;
}

@Injectable()
export class EarningsCalculatorService {
  calculate(input: EarningsCalculationInput): EarningsCalculationResult {
    const rate = input.commissionRateOverride ?? input.commissionRate;
    const earningsBaseAmount = this.resolveEarningsBaseAmount(
      input.bookingType,
      input.services,
      input.totalAmount,
    );
    const earningsAmount =
      Math.round(earningsBaseAmount * rate * 100) / 100;

    return {
      commissionRate: rate,
      earningsBaseAmount,
      earningsAmount,
    };
  }

  resolveEarningsBaseAmount(
    bookingType: BookingType,
    services: unknown,
    totalAmount: number,
  ): number {
    if (bookingType === BookingType.MIXED) {
      const records = normalizeBookingServices(services);
      return sumHomeServiceAmount(records);
    }

    return totalAmount;
  }

  sumHomeServiceAmountFromRecords(records: BookingServiceRecord[]): number {
    return sumHomeServiceAmount(records);
  }
}