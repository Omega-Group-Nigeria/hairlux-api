import { Injectable, Logger } from '@nestjs/common';
import {
  BookingStatus,
  BookingType,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { EarningsCalculatorService } from './earnings-calculator.service';
import { BeauticianStatsService } from './beautician-stats.service';
import { ServiceCommissionRateService } from './service-commission-rate.service';
import { BeauticianCommissionRateService } from './beautician-commission-rate.service';

@Injectable()
export class CreditServiceEarningsService {
  private readonly logger = new Logger(CreditServiceEarningsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: HomeServiceSettingsService,
    private readonly earningsCalculator: EarningsCalculatorService,
    private readonly serviceCommissionRates: ServiceCommissionRateService,
    private readonly beauticianCommissionRates: BeauticianCommissionRateService,
    private readonly statsService: BeauticianStatsService,
    private readonly redis: RedisService,
  ) {}

  async refreshBeauticianRatingAfterReview(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { assignedBeauticianUserId: true },
    });

    if (!booking?.assignedBeauticianUserId) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.statsService.syncRatingAverage(
        tx,
        booking.assignedBeauticianUserId!,
      );
    });
  }

  async creditForCompletedBooking(
    bookingId: string,
    _customerRating?: number | null,
  ) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      this.logger.warn(`Earnings credit skipped: booking ${bookingId} not found`);
      return null;
    }

    if (booking.status !== BookingStatus.COMPLETED) {
      this.logger.log(
        `Earnings credit skipped for ${bookingId}: status is ${booking.status}`,
      );
      return null;
    }

    if (!booking.assignedBeauticianUserId) {
      this.logger.log(`Earnings credit skipped for ${bookingId}: no beautician`);
      return null;
    }

    if (
      booking.bookingType !== BookingType.HOME_SERVICE &&
      booking.bookingType !== BookingType.MIXED
    ) {
      return null;
    }

    const reference = this.earningsReference(bookingId);
    const existing = await this.prisma.transaction.findUnique({
      where: { reference },
    });

    if (existing) {
      this.logger.log(`Earnings already credited for booking ${bookingId}`);
      return {
        bookingId,
        amount: Number(existing.amount),
        reference,
        alreadyCredited: true,
      };
    }

    const [settings, serviceCommissionRates, beauticianRateMap] =
      await Promise.all([
        this.settingsService.getSettings(),
        this.serviceCommissionRates.getRateMapForBookingServices(booking.services),
        this.beauticianCommissionRates.getRateMapForBeauticianIds([
          booking.assignedBeauticianUserId!,
        ]),
      ]);

    const calculation = this.earningsCalculator.calculate({
      bookingType: booking.bookingType,
      services: booking.services,
      totalAmount: Number(booking.totalAmount),
      defaultCommissionRate: settings.commissionRate,
      serviceCommissionRates,
      beauticianCommissionRate: beauticianRateMap.get(
        booking.assignedBeauticianUserId!,
      ),
    });

    if (calculation.earningsAmount <= 0) {
      this.logger.log(`Zero earnings for booking ${bookingId}`);
      return null;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const beauticianUserId = booking.assignedBeauticianUserId!;
      let wallet = await tx.wallet.findFirst({
        where: { userId: beauticianUserId },
        select: { id: true },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: {
            userId: beauticianUserId,
            balance: 0,
          },
          select: { id: true },
        });
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: calculation.earningsAmount },
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: calculation.earningsAmount,
          type: TransactionType.SERVICE_EARNINGS,
          status: TransactionStatus.COMPLETED,
          paymentMethod: 'WALLET',
          reference,
          description: `Service earnings for booking ${booking.reservationCode}`,
          metadata: {
            bookingId,
            reservationCode: booking.reservationCode,
            commissionRate: calculation.commissionRate,
            defaultCommissionRate: calculation.defaultCommissionRate,
            earningsBaseAmount: calculation.earningsBaseAmount,
            bookingTotalAmount: Number(booking.totalAmount),
            lines: calculation.lines,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await this.statsService.applyCompletedJobStats(
        tx,
        booking.assignedBeauticianUserId!,
        calculation.earningsAmount,
      );

      return {
        bookingId,
        amount: calculation.earningsAmount,
        commissionRate: calculation.commissionRate,
        earningsBaseAmount: calculation.earningsBaseAmount,
        reference,
        transactionId: transaction.id,
        alreadyCredited: false,
      };
    });

    void this.redis.del(`wallet:balance:${booking.assignedBeauticianUserId}`);
    this.logger.log(
      `Credited ₦${result.amount} service earnings for booking ${bookingId}`,
    );

    return result;
  }

  private earningsReference(bookingId: string): string {
    return `SVC-EARN-${bookingId}`;
  }
}
