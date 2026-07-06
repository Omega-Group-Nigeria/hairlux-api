import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateHomeServiceSettingsDto } from '../dto/update-home-service-settings.dto';

const DEFAULT_SETTINGS = {
  commissionRate: 0.7,
  jobOfferTimeoutMinutes: 4,
  kycAutoApprove: true,
  arrivalVerificationExpiryMinutes: 15,
  serviceCompletionBufferMinutes: 60,
  payoutMode: 'MANUAL' as const,
  arrivalGeoFenceMeters: 250,
  noShowPenaltyEnabled: true,
  noShowSuspendThreshold: 3,
  noShowWindowDays: 30,
};

@Injectable()
export class HomeServiceSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const settings = await this.ensureSettingsExist();
    return this.serialize(settings);
  }

  async updateSettings(dto: UpdateHomeServiceSettingsDto) {
    const existing = await this.ensureSettingsExist();

    const updated = await this.prisma.homeServiceSettings.update({
      where: { id: existing.id },
      data: {
        ...(dto.commissionRate !== undefined && {
          commissionRate: dto.commissionRate,
        }),
        ...(dto.jobOfferTimeoutMinutes !== undefined && {
          jobOfferTimeoutMinutes: dto.jobOfferTimeoutMinutes,
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

    return this.serialize(updated);
  }

  private async ensureSettingsExist() {
    const existing = await this.prisma.homeServiceSettings.findFirst();
    if (existing) return existing;

    return this.prisma.homeServiceSettings.create({
      data: DEFAULT_SETTINGS,
    });
  }

  private serialize<T extends Record<string, unknown>>(settings: T) {
    return {
      ...settings,
      commissionRate: Number(settings.commissionRate),
    };
  }
}