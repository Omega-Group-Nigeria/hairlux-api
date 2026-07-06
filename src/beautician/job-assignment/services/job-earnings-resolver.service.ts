import { Injectable } from '@nestjs/common';
import { BookingType, JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';

export interface ResolvedJobEarnings {
  payoutAmount: number;
  commissionRate: number;
}

type ActiveBookingForEarnings = {
  id: string;
  bookingType: BookingType;
  services: unknown;
  totalAmount: unknown;
};

@Injectable()
export class JobEarningsResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly earningsCalculator: EarningsCalculatorService,
  ) {}

  async resolveForActiveBookings(
    beauticianUserId: string,
    bookings: ActiveBookingForEarnings[],
  ): Promise<Map<string, ResolvedJobEarnings>> {
    if (!bookings.length) {
      return new Map();
    }

    const bookingIds = bookings.map((booking) => booking.id);
    const [settings, profile, acceptedOffers] = await Promise.all([
      this.settingsService.getSettings(),
      this.prisma.beauticianProfile.findUnique({
        where: { userId: beauticianUserId },
        select: { commissionRateOverride: true },
      }),
      this.prisma.jobOffer.findMany({
        where: {
          bookingId: { in: bookingIds },
          beauticianUserId,
          status: JobOfferStatus.ACCEPTED,
        },
        select: { bookingId: true, estEarningsAtOffer: true },
      }),
    ]);

    const offerByBookingId = new Map(
      acceptedOffers.map((offer) => [offer.bookingId, offer]),
    );

    return new Map(
      bookings.map((booking) => [
        booking.id,
        this.resolveFromContext(booking, {
          settingsCommissionRate: settings.commissionRate,
          commissionRateOverride: profile?.commissionRateOverride
            ? Number(profile.commissionRateOverride)
            : null,
          estEarningsAtOffer:
            offerByBookingId.get(booking.id)?.estEarningsAtOffer ?? null,
        }),
      ]),
    );
  }

  resolveFromOfferSnapshot(
    booking: ActiveBookingForEarnings,
    params: {
      estEarningsAtOffer?: unknown;
      commissionRate: number;
      commissionRateOverride?: number | null;
    },
  ): ResolvedJobEarnings {
    return this.resolveFromContext(booking, {
      settingsCommissionRate: params.commissionRate,
      commissionRateOverride: params.commissionRateOverride ?? null,
      estEarningsAtOffer: params.estEarningsAtOffer ?? null,
    });
  }

  private resolveFromContext(
    booking: ActiveBookingForEarnings,
    context: {
      settingsCommissionRate: number;
      commissionRateOverride: number | null;
      estEarningsAtOffer: unknown;
    },
  ): ResolvedJobEarnings {
    const calculation = this.earningsCalculator.calculate({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount ?? 0),
      commissionRate: context.settingsCommissionRate,
      commissionRateOverride: context.commissionRateOverride,
    });

    const payoutAmount =
      context.estEarningsAtOffer != null
        ? Math.round(Number(context.estEarningsAtOffer) * 100) / 100
        : calculation.earningsAmount;

    return {
      payoutAmount,
      commissionRate: calculation.commissionRate,
    };
  }
}