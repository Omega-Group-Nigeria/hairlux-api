import { Injectable } from '@nestjs/common';
import { HomeServiceSettings, PayoutMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateHomeServiceSettingsDto } from '../dto/update-home-service-settings.dto';

const DEFAULT_SETTINGS = {
  commissionRate: 0.7,
  kycAutoApprove: true,
  arrivalVerificationExpiryMinutes: 15,
  serviceCompletionBufferMinutes: 60,
  payoutMode: 'MANUAL' as const,
  dailyPayoutLimit: null as number | null,
  arrivalGeoFenceMeters: 250,
  noShowPenaltyEnabled: true,
  noShowSuspendThreshold: 3,
  noShowWindowDays: 30,
};

/** Short TTL so multi-instance deploys eventually pick up admin updates. */
const SETTINGS_CACHE_TTL_MS = 30_000;

export type SerializedHomeServiceSettings = Omit<
  HomeServiceSettings,
  'commissionRate' | 'dailyPayoutLimit'
> & {
  commissionRate: number;
  dailyPayoutLimit: number | null;
};

@Injectable()
export class HomeServiceSettingsService {
  private cache: {
    value: SerializedHomeServiceSettings;
    expiresAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<SerializedHomeServiceSettings> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    const settings = await this.ensureSettingsExist();
    const serialized = this.serialize(settings);
    this.cache = {
      value: serialized,
      expiresAt: now + SETTINGS_CACHE_TTL_MS,
    };
    return serialized;
  }

  async updateSettings(
    dto: UpdateHomeServiceSettingsDto,
  ): Promise<SerializedHomeServiceSettings> {
    const existing = await this.ensureSettingsExist();

    const updated = await this.prisma.homeServiceSettings.update({
      where: { id: existing.id },
      data: {
        ...(dto.commissionRate !== undefined && {
          commissionRate: dto.commissionRate,
        }),
        ...(dto.kycAutoApprove !== undefined && {
          kycAutoApprove: dto.kycAutoApprove,
        }),
        ...(dto.arrivalVerificationExpiryMinutes !== undefined && {
          arrivalVerificationExpiryMinutes: dto.arrivalVerificationExpiryMinutes,
        }),
        ...(dto.serviceCompletionBufferMinutes !== undefined && {
          serviceCompletionBufferMinutes: dto.serviceCompletionBufferMinutes,
        }),
        ...(dto.payoutMode !== undefined && { payoutMode: dto.payoutMode }),
        ...(dto.dailyPayoutLimit !== undefined && {
          dailyPayoutLimit: dto.dailyPayoutLimit,
        }),
        ...(dto.arrivalGeoFenceMeters !== undefined && {
          arrivalGeoFenceMeters: dto.arrivalGeoFenceMeters,
        }),
        ...(dto.noShowPenaltyEnabled !== undefined && {
          noShowPenaltyEnabled: dto.noShowPenaltyEnabled,
        }),
        ...(dto.noShowSuspendThreshold !== undefined && {
          noShowSuspendThreshold: dto.noShowSuspendThreshold,
        }),
        ...(dto.noShowWindowDays !== undefined && {
          noShowWindowDays: dto.noShowWindowDays,
        }),
      },
    });

    const serialized = this.serialize(updated);
    this.cache = {
      value: serialized,
      expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS,
    };
    return serialized;
  }

  /** Drop cache (e.g. tests or forced refresh). */
  clearCache() {
    this.cache = null;
  }

  private async ensureSettingsExist() {
    const existing = await this.prisma.homeServiceSettings.findFirst();
    if (existing) return existing;

    return this.prisma.homeServiceSettings.create({
      data: DEFAULT_SETTINGS,
    });
  }

  private serialize(
    settings: HomeServiceSettings,
  ): SerializedHomeServiceSettings {
    return {
      ...settings,
      commissionRate: Number(settings.commissionRate),
      dailyPayoutLimit:
        settings.dailyPayoutLimit == null
          ? null
          : Number(settings.dailyPayoutLimit),
      payoutMode: settings.payoutMode as PayoutMode,
    };
  }
}
