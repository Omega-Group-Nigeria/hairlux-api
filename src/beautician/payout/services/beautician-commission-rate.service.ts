import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface BeauticianCommissionRateView {
  beauticianUserId: string;
  beauticianName: string | null;
  commissionRate: number;
  updatedAt: Date;
}

@Injectable()
export class BeauticianCommissionRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Load override rates for the given beautician user IDs.
   * Beauticians without a row are omitted (caller applies lower-precedence rates).
   */
  async getRateMapForBeauticianIds(
    beauticianUserIds: string[],
  ): Promise<Map<string, number>> {
    const uniqueIds = [...new Set(beauticianUserIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return new Map();
    }

    const rows = await this.prisma.beauticianCommissionRate.findMany({
      where: { beauticianUserId: { in: uniqueIds } },
      select: { beauticianUserId: true, commissionRate: true },
    });

    return new Map(
      rows.map((row) => [row.beauticianUserId, Number(row.commissionRate)]),
    );
  }

  async listOverrides(): Promise<BeauticianCommissionRateView[]> {
    const rows = await this.prisma.beauticianCommissionRate.findMany({
      include: {
        beautician: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => ({
      beauticianUserId: row.beauticianUserId,
      beauticianName: row.beautician
        ? `${row.beautician.firstName} ${row.beautician.lastName}`.trim()
        : null,
      commissionRate: Number(row.commissionRate),
      updatedAt: row.updatedAt,
    }));
  }

  async upsertOverride(
    beauticianUserId: string,
    commissionRate: number,
  ): Promise<BeauticianCommissionRateView> {
    this.assertValidRate(commissionRate);

    const beautician = await this.prisma.user.findUnique({
      where: { id: beauticianUserId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!beautician) {
      throw new NotFoundException('Beautician user not found');
    }

    const row = await this.prisma.beauticianCommissionRate.upsert({
      where: { beauticianUserId },
      create: {
        beauticianUserId,
        commissionRate,
      },
      update: {
        commissionRate,
      },
      include: {
        beautician: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return {
      beauticianUserId: row.beauticianUserId,
      beauticianName: row.beautician
        ? `${row.beautician.firstName} ${row.beautician.lastName}`.trim()
        : null,
      commissionRate: Number(row.commissionRate),
      updatedAt: row.updatedAt,
    };
  }

  async removeOverride(beauticianUserId: string): Promise<void> {
    const existing = await this.prisma.beauticianCommissionRate.findUnique({
      where: { beauticianUserId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(
        'No commission override exists for this beautician',
      );
    }

    await this.prisma.beauticianCommissionRate.delete({
      where: { beauticianUserId },
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
