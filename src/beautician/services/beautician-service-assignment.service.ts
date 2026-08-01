import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BeauticianMeCacheService } from './beautician-me-cache.service';

@Injectable()
export class BeauticianServiceAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meCache: BeauticianMeCacheService,
  ) {}

  async assignServices(
    profileId: string,
    serviceIds: string[],
    adminUserId: string,
  ) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');

    const uniqueServiceIds = [...new Set(serviceIds)];

    const services = await this.prisma.service.findMany({
      where: {
        id: { in: uniqueServiceIds },
        isHomeServiceAvailable: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (services.length !== uniqueServiceIds.length) {
      throw new BadRequestException(
        'One or more services are invalid or not available for home service',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.beauticianService.deleteMany({
        where: { beauticianProfileId: profileId },
      });

      if (uniqueServiceIds.length > 0) {
        await tx.beauticianService.createMany({
          data: uniqueServiceIds.map((serviceId) => ({
            beauticianProfileId: profileId,
            serviceId,
            assignedById: adminUserId,
          })),
        });
      }
    });

    await this.meCache.invalidate(profile.userId);

    return this.getAssignedServices(profileId);
  }

  async getAssignedServices(profileId: string) {
    const assignments = await this.prisma.beauticianService.findMany({
      where: { beauticianProfileId: profileId },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            homeServicePrice: true,
            duration: true,
            isHomeServiceAvailable: true,
          },
        },
        assignedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return assignments.map((a) => ({
      id: a.id,
      serviceId: a.serviceId,
      assignedAt: a.assignedAt,
      service: {
        ...a.service,
        homeServicePrice: Number(a.service.homeServicePrice),
      },
      assignedBy: a.assignedBy,
    }));
  }
}