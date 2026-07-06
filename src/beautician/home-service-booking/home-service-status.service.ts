import { BadRequestException, Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import {
  BookingServiceRecord,
  normalizeBookingServices,
} from '../../booking/utils/booking.utils';

const HOME_SERVICE_TRANSITIONS: Partial<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  [BookingStatus.ASSIGNED]: [BookingStatus.EN_ROUTE],
  [BookingStatus.EN_ROUTE]: [BookingStatus.ARRIVED],
  [BookingStatus.ARRIVED]: [BookingStatus.ARRIVED_VERIFIED],
  [BookingStatus.ARRIVED_VERIFIED]: [BookingStatus.IN_PROGRESS],
  [BookingStatus.IN_PROGRESS]: [BookingStatus.AWAITING_CUSTOMER_CONFIRM],
  [BookingStatus.AWAITING_CUSTOMER_CONFIRM]: [BookingStatus.COMPLETED],
};

export const ACTIVE_HOME_SERVICE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
];

export const BEAUTICIAN_JOB_HISTORY_STATUSES: readonly BookingStatus[] = [
  ...ACTIVE_HOME_SERVICE_STATUSES,
  BookingStatus.COMPLETED,
  BookingStatus.CANCELLED,
];

@Injectable()
export class HomeServiceStatusService {
  canTransition(from: BookingStatus, to: BookingStatus): boolean {
    return HOME_SERVICE_TRANSITIONS[from]?.includes(to) ?? false;
  }

  assertTransition(from: BookingStatus, to: BookingStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid booking status transition from ${from} to ${to}`,
      );
    }
  }

  calculateBookedDurationMinutes(services: unknown): number {
    const records = normalizeBookingServices(services);
    return this.sumDurationMinutes(records);
  }

  sumDurationMinutes(records: BookingServiceRecord[]): number {
    return records.reduce(
      (sum, service) => sum + service.duration * service.quantity,
      0,
    );
  }

  calculateServiceEndsAt(
    serviceStartedAt: Date,
    services: unknown,
    bufferMinutes: number,
  ): Date {
    const durationMinutes = this.calculateBookedDurationMinutes(services);
    return new Date(
      serviceStartedAt.getTime() + (durationMinutes + bufferMinutes) * 60_000,
    );
  }
}