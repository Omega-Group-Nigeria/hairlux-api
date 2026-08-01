import { Injectable } from '@nestjs/common';
import { BookingType } from '@prisma/client';
import {
  BookingServiceRecord,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { sumHomeServiceAmount } from '../../matching/utils/booking-assignment.utils';

export type ServiceCommissionRateMap = ReadonlyMap<string, number>;

export interface EarningsCalculationInput {
  bookingType: BookingType;
  services: unknown;
  totalAmount: number;
  /** Platform default when a service has no override row. */
  defaultCommissionRate: number;
  /** serviceId → rate (0–1). Only overridden services need entries. */
  serviceCommissionRates?: ServiceCommissionRateMap;
}

export interface EarningsLineBreakdown {
  serviceId: string;
  lineAmount: number;
  commissionRate: number;
  earningsAmount: number;
}

export interface EarningsCalculationResult {
  /** Blended effective rate (earnings / base), or default when base is 0. */
  commissionRate: number;
  defaultCommissionRate: number;
  earningsBaseAmount: number;
  earningsAmount: number;
  lines: EarningsLineBreakdown[];
}

@Injectable()
export class EarningsCalculatorService {
  calculate(input: EarningsCalculationInput): EarningsCalculationResult {
    const defaultRate = this.clampRate(input.defaultCommissionRate);
    const rateMap = input.serviceCommissionRates ?? new Map<string, number>();
    const homeLines = this.resolveHomeServiceLines(
      input.bookingType,
      input.services,
    );

    if (!homeLines.length) {
      const base = this.resolveFallbackBase(input.bookingType, input.totalAmount);
      const earningsAmount = this.roundMoney(base * defaultRate);
      return {
        commissionRate: defaultRate,
        defaultCommissionRate: defaultRate,
        earningsBaseAmount: base,
        earningsAmount,
        lines: [],
      };
    }

    const lines: EarningsLineBreakdown[] = homeLines.map((line) => {
      const lineAmount = this.roundMoney(line.price * line.quantity);
      const commissionRate = this.resolveLineRate(line.serviceId, rateMap, defaultRate);
      return {
        serviceId: line.serviceId,
        lineAmount,
        commissionRate,
        earningsAmount: this.roundMoney(lineAmount * commissionRate),
      };
    });

    const earningsBaseAmount = this.roundMoney(
      lines.reduce((sum, line) => sum + line.lineAmount, 0),
    );
    const earningsAmount = this.roundMoney(
      lines.reduce((sum, line) => sum + line.earningsAmount, 0),
    );
    const commissionRate =
      earningsBaseAmount > 0
        ? this.roundRate(earningsAmount / earningsBaseAmount)
        : defaultRate;

    return {
      commissionRate,
      defaultCommissionRate: defaultRate,
      earningsBaseAmount,
      earningsAmount,
      lines,
    };
  }

  resolveEarningsBaseAmount(
    bookingType: BookingType,
    services: unknown,
    totalAmount: number,
  ): number {
    if (bookingType === BookingType.MIXED) {
      return sumHomeServiceAmount(normalizeBookingServices(services));
    }
    if (bookingType === BookingType.HOME_SERVICE) {
      const records = this.resolveHomeServiceLines(bookingType, services);
      if (records.length) {
        return sumHomeServiceAmount(records);
      }
    }
    return totalAmount;
  }

  sumHomeServiceAmountFromRecords(records: BookingServiceRecord[]): number {
    return sumHomeServiceAmount(records);
  }

  private resolveHomeServiceLines(
    bookingType: BookingType,
    services: unknown,
  ): BookingServiceRecord[] {
    const records = normalizeBookingServices(services);
    if (bookingType === BookingType.HOME_SERVICE) {
      return records.filter((r) => Boolean(r.serviceId));
    }
    if (bookingType === BookingType.MIXED) {
      return records.filter(
        (service) =>
          Boolean(service.serviceId) &&
          (!service.serviceMode ||
            service.serviceMode === BookingType.HOME_SERVICE),
      );
    }
    return [];
  }

  private resolveFallbackBase(
    bookingType: BookingType,
    totalAmount: number,
  ): number {
    if (
      bookingType === BookingType.HOME_SERVICE ||
      bookingType === BookingType.MIXED
    ) {
      return totalAmount;
    }
    return 0;
  }

  private resolveLineRate(
    serviceId: string,
    rateMap: ServiceCommissionRateMap,
    defaultRate: number,
  ): number {
    if (rateMap.has(serviceId)) {
      return this.clampRate(rateMap.get(serviceId)!);
    }
    return defaultRate;
  }

  private clampRate(rate: number): number {
    if (!Number.isFinite(rate)) {
      return 0;
    }
    return Math.min(1, Math.max(0, rate));
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private roundRate(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
