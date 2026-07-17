import { Injectable } from '@nestjs/common';
import { BookingType, JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { EarningsCalculatorService } from '../../payout/services/earnings-calculator.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';

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
    private readonly serviceCommissionRates: ServiceCommissionRateService,
  ) {}

  async resolveForActiveBookings(
    beauticianUserId: string,
    bookings: ActiveBookingForEarnings[],
  ): Promise<Map<string, ResolvedJobEarnings>> {
    if (!bookings.length) {
      return new Map();
    }

    const bookingIds = bookings.map((booking) => booking.id);
    const allServiceIds = bookings.flatMap((booking) =>
      this.extractServiceIds(booking.services),
    );

    const [settings, acceptedOffers, rateMap] = await Promise.all([
      this.settingsService.getSettings(),
      this.prisma.jobOffer.findMany({
        where: {
          bookingId: { in: bookingIds },
          beauticianUserId,
          status: JobOfferStatus.ACCEPTED,
        },
        select: { bookingId: true, estEarningsAtOffer: true },
      }),
      this.serviceCommissionRates.getRateMapForServiceIds(allServiceIds),
    ]);

    const offerByBookingId = new Map(
      acceptedOffers.map((offer) => [offer.bookingId, offer]),
    );

    return new Map(
      bookings.map((booking) => [
        booking.id,
        this.resolveFromContext(booking, {
          defaultCommissionRate: settings.commissionRate,
          serviceCommissionRates: rateMap,
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
      defaultCommissionRate: number;
      serviceCommissionRates?: Map<string, number>;
    },
  ): ResolvedJobEarnings {
    return this.resolveFromContext(booking, {
      defaultCommissionRate: params.defaultCommissionRate,
      serviceCommissionRates:
        params.serviceCommissionRates ?? new Map<string, number>(),
      estEarningsAtOffer: params.estEarningsAtOffer ?? null,
    });
  }

  private resolveFromContext(
    booking: ActiveBookingForEarnings,
    context: {
      defaultCommissionRate: number;
      serviceCommissionRates: Map<string, number>;
      estEarningsAtOffer: unknown;
    },
  ): ResolvedJobEarnings {
    const calculation = this.earningsCalculator.calculate({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount ?? 0),
      defaultCommissionRate: context.defaultCommissionRate,
      serviceCommissionRates: context.serviceCommissionRates,
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

  private extractServiceIds(services: unknown): string[] {
    if (!Array.isArray(services)) {
      return [];
    }
    return services
      .map((item) =>
        item && typeof item === 'object' && 'serviceId' in item
          ? String((item as { serviceId: unknown }).serviceId)
          : '',
      )
      .filter(Boolean);
  }
}
