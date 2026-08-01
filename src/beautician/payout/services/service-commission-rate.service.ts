import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeBookingServices } from '../../../booking/utils/booking.utils';

export interface ServiceCommissionRateView {
  serviceId: string;
  serviceName: string;
  commissionRate: number;
  updatedAt: Date;
}

@Injectable()
export class ServiceCommissionRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load override rates for the given service IDs.
   * Services without a row are omitted (caller applies platform default).
   */
  async getRateMapForServiceIds(
    serviceIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(serviceIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map();
    }

    const rows = await this.prisma.serviceCommissionRate.findMany({
      where: { serviceId: { in: uniqueIds } },
      select: { serviceId: true, commissionRate: true },
    });

    return new Map(
      rows.map((row) => [row.serviceId, Number(row.commissionRate)]),
    );
  }

  /** Extract service IDs from booking.services JSON and load their overrides. */
  async getRateMapForBookingServices(
    services: unknown,
  ): Promise<Map<string, number>> {
    const records = normalizeBookingServices(services);
    const serviceIds = records.map((r) => r.serviceId).filter(Boolean);
    return this.getRateMapForServiceIds(serviceIds);
  }

  async listOverrides(): Promise<ServiceCommissionRateView[]> {
    const rows = await this.prisma.serviceCommissionRate.findMany({
      include: {
        service: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => ({
      serviceId: row.serviceId,
      serviceName: row.service.name,
      commissionRate: Number(row.commissionRate),
      updatedAt: row.updatedAt,
    }));
  }

  async upsertOverride(
    serviceId: string,
    commissionRate: number,
  ): Promise<ServiceCommissionRateView> {
    this.assertValidRate(commissionRate);

    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true, name: true },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const row = await this.prisma.serviceCommissionRate.upsert({
      where: { serviceId },
      create: {
        serviceId,
        commissionRate,
      },
      update: {
        commissionRate,
      },
      include: {
        service: { select: { id: true, name: true } },
      },
    });

    return {
      serviceId: row.serviceId,
      serviceName: row.service.name,
      commissionRate: Number(row.commissionRate),
      updatedAt: row.updatedAt,
    };
  }

  async removeOverride(serviceId: string): Promise<void> {
    const existing = await this.prisma.serviceCommissionRate.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(
        'No commission override exists for this service',
      );
    }

    await this.prisma.serviceCommissionRate.delete({
      where: { serviceId },
    });
  }

  private assertValidRate(rate: number): void {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      throw new BadRequestException(
        'commissionRate must be a number between 0 and 1 (e.g. 0.05 = 5%)',
      );
    }
  }
}
