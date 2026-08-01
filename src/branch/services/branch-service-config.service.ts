import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { decimalToNumber } from '../utils/branch-pricing.utils';
import { PatchBranchServicesDto } from '../dto/patch-branch-services.dto';
import { SetBranchServicesDto } from '../dto/set-branch-services.dto';
import { BranchLocationService } from './branch-location.service';

const TTL = 300;

@Injectable()
export class BranchServiceConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly branchLocationService: BranchLocationService,
  ) {}

  async getAdminMatrix(branchId: string) {
    const cacheKey = `branch-services:matrix:${branchId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    await this.branchLocationService.findOneAdmin(branchId);

    const [catalogServices, assignments] = await Promise.all([
      this.prisma.service.findMany({
        where: { status: ServiceStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          categoryId: true,
          walkInPrice: true,
          homeServicePrice: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.branchService.findMany({
        where: { branchId },
      }),
    ]);

    const assignmentByServiceId = new Map(
      assignments.map((row) => [row.serviceId, row]),
    );

    const result = catalogServices.map((service) => {
      const assignment = assignmentByServiceId.get(service.id);
      const isAssigned = Boolean(assignment);
      const isAvailable = assignment?.isAvailable ?? false;

      return {
        serviceId: service.id,
        name: service.name,
        categoryId: service.categoryId,
        catalogWalkInPrice: decimalToNumber(service.walkInPrice),
        catalogHomeServicePrice: decimalToNumber(service.homeServicePrice),
        isAssigned,
        isAvailable,
        walkInPrice: assignment
          ? decimalToNumber(assignment.walkInPrice)
          : null,
      };
    });

    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async setAvailableServices(branchId: string, dto: SetBranchServicesDto) {
    await this.branchLocationService.findOneAdmin(branchId);

    const uniqueServiceIds = [...new Set(dto.serviceIds)];
    const activeServices = await this.prisma.service.findMany({
      where: {
        id: { in: uniqueServiceIds },
        status: ServiceStatus.ACTIVE,
      },
      select: { id: true },
    });

    if (activeServices.length !== uniqueServiceIds.length) {
      throw new NotFoundException(
        'One or more services were not found or are inactive',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const serviceId of uniqueServiceIds) {
        await tx.branchService.upsert({
          where: {
            branchId_serviceId: { branchId, serviceId },
          },
          create: {
            branchId,
            serviceId,
            isAvailable: true,
          },
          update: {
            isAvailable: true,
          },
        });
      }

      await tx.branchService.updateMany({
        where: {
          branchId,
          serviceId: { notIn: uniqueServiceIds },
        },
        data: { isAvailable: false },
      });
    });

    await this.invalidateServiceCaches(branchId);
    return this.getAdminMatrix(branchId);
  }

  async patchServices(branchId: string, dto: PatchBranchServicesDto) {
    await this.branchLocationService.findOneAdmin(branchId);

    for (const item of dto.services) {
      const existing = await this.prisma.branchService.findUnique({
        where: {
          branchId_serviceId: {
            branchId,
            serviceId: item.serviceId,
          },
        },
      });

      const touchesPriceOrAvailability =
        item.isAvailable !== undefined || item.walkInPrice !== undefined;

      if (!existing && touchesPriceOrAvailability) {
        if (item.isAvailable === false) {
          throw new BadRequestException(
            `Service ${item.serviceId} is not assigned to this branch`,
          );
        }

        if (item.walkInPrice !== undefined && item.isAvailable !== true) {
          throw new BadRequestException(
            `Assign service ${item.serviceId} to the branch before setting walk-in price`,
          );
        }
      }

      if (!existing && item.isAvailable === true) {
        await this.prisma.branchService.create({
          data: {
            branchId,
            serviceId: item.serviceId,
            isAvailable: true,
            ...(item.walkInPrice !== undefined && item.walkInPrice !== null
              ? { walkInPrice: item.walkInPrice }
              : {}),
          },
        });
        continue;
      }

      if (!existing) {
        throw new BadRequestException(
          `Service ${item.serviceId} is not assigned to this branch`,
        );
      }

      await this.prisma.branchService.update({
        where: {
          branchId_serviceId: {
            branchId,
            serviceId: item.serviceId,
          },
        },
        data: {
          ...(item.isAvailable !== undefined && {
            isAvailable: item.isAvailable,
          }),
          ...(item.walkInPrice !== undefined && {
            walkInPrice: item.walkInPrice,
          }),
        },
      });
    }

    await this.invalidateServiceCaches(branchId);
    return this.getAdminMatrix(branchId);
  }

  private async invalidateServiceCaches(branchId: string) {
    await Promise.all([
      this.redis.del(`branch-services:matrix:${branchId}`),
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern('services:one:*'),
      this.redis.delByPattern('branches:open:*'),
    ]);
  }
}