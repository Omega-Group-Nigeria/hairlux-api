import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { HomeServiceSettingsService } from './home-service-settings.service';

@Injectable()
export class NoShowPenaltyService {
  private readonly logger = new Logger(NoShowPenaltyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settingsService: HomeServiceSettingsService,
  ) {}

  async recordIfApplicable(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        status: true,
        assignedBeauticianUserId: true,
        cancelReason: true,
      },
    });

    if (
      !booking ||
      booking.status !== BookingStatus.CANCELLED ||
      !booking.assignedBeauticianUserId
    ) {
      return null;
    }

    const reason = (booking.cancelReason ?? '').toLowerCase();
    const isNoShow =
      reason.includes('no-show') ||
      reason.includes('no show') ||
      reason.includes('noshow');

    if (!isNoShow) {
      return null;
    }

    return this.recordNoShow(booking.assignedBeauticianUserId);
  }

  async recordNoShow(beauticianUserId: string) {
    const settings = await this.settingsService.getSettings();

    if (!settings.noShowPenaltyEnabled) {
      return { suspended: false, skipped: true };
    }

    const windowDays = settings.noShowWindowDays ?? 30;
    const threshold = settings.noShowSuspendThreshold ?? 3;
    const counterKey = `beautician:noshow:${beauticianUserId}`;

    const count = await this.redis.incr(counterKey);
    if (count === 1) {
      await this.redis.expire(counterKey, windowDays * 24 * 60 * 60);
    }

    if (count < threshold) {
      return { suspended: false, count, threshold };
    }

    await this.prisma.beauticianProfile.update({
      where: { userId: beauticianUserId },
      data: { isActive: false, availabilityStatus: 'OFFLINE' },
    });

    this.logger.warn(
      `Beautician ${beauticianUserId} suspended after ${count} no-shows`,
    );

    return { suspended: true, count, threshold };
  }
}