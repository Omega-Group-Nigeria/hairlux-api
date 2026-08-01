import { BadRequestException, Injectable } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Calendar day used for the platform payout pool. */
const PAYOUT_DAY_TIMEZONE = 'Africa/Lagos';

const COUNTED_STATUSES: PayoutRequestStatus[] = [
  PayoutRequestStatus.PENDING,
  PayoutRequestStatus.PROCESSING,
  PayoutRequestStatus.COMPLETED,
];

export type DailyPayoutPoolStatus = {
  /** Configured limit; null means unlimited */
  limit: number | null;
  /** Sum of PENDING + PROCESSING + COMPLETED created today (platform-wide) */
  used: number;
  /** Remaining capacity; null when unlimited */
  remaining: number | null;
  /** Start of the current pool day (UTC instant) */
  dayStartsAt: Date;
  timezone: string;
  unlimited: boolean;
};

@Injectable()
export class DailyPayoutLimitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Assert that adding `amount` would not exceed the platform-wide daily pool.
   * Pass `excludePayoutRequestId` when converting an existing PENDING request
   * so that request is not double-counted.
   */
  async assertWithinDailyLimit(
    amount: number,
    excludePayoutRequestId?: string,
  ): Promise<void> {
    const status = await this.getPoolStatus(excludePayoutRequestId);

    if (status.unlimited || status.limit === null) {
      return;
    }

    if (status.used + amount > status.limit) {
      throw new BadRequestException(
        "This withdrawal can't be processed right now. Please try again tomorrow.",
      );
    }
  }

  async getPoolStatus(
    excludePayoutRequestId?: string,
  ): Promise<DailyPayoutPoolStatus> {
    const settings = await this.prisma.homeServiceSettings.findFirst({
      select: { dailyPayoutLimit: true },
    });

    const limit =
      settings?.dailyPayoutLimit == null
        ? null
        : Number(settings.dailyPayoutLimit);

    const dayStartsAt = this.getStartOfDayInTimezone(PAYOUT_DAY_TIMEZONE);

    const aggregate = await this.prisma.payoutRequest.aggregate({
      where: {
        status: { in: COUNTED_STATUSES },
        createdAt: { gte: dayStartsAt },
        ...(excludePayoutRequestId
          ? { id: { not: excludePayoutRequestId } }
          : {}),
      },
      _sum: { amount: true },
    });

    const used = Number(aggregate._sum.amount ?? 0);
    const unlimited = limit === null;

    return {
      limit,
      used,
      remaining: unlimited ? null : Math.max(0, limit - used),
      dayStartsAt,
      timezone: PAYOUT_DAY_TIMEZONE,
      unlimited,
    };
  }

  /**
   * Returns the UTC Date corresponding to 00:00:00 in the given IANA timezone
   * for "today" in that timezone.
   */
  getStartOfDayInTimezone(timeZone: string, now = new Date()): Date {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;

    if (!year || !month || !day) {
      // Fallback: UTC midnight
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    }

    // Walk UTC candidates to find the instant that is local midnight in `timeZone`.
    // Lagos is UTC+1 with no DST; binary search covers other zones safely.
    const targetDate = `${year}-${month}-${day}`;
    let low = Date.UTC(Number(year), Number(month) - 1, Number(day) - 1);
    let high = Date.UTC(Number(year), Number(month) - 1, Number(day) + 1);

    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      const midDate = formatter.format(new Date(mid));
      if (midDate < targetDate) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return new Date(low);
  }
}
