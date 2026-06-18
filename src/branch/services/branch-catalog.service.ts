import { Injectable, NotFoundException } from '@nestjs/common';
import { BranchService, StaffLocation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { QueryBranchesDto } from '../dto/query-branches.dto';

const TTL = 300;

export type BranchAssignmentRecord = Pick<
  BranchService,
  'serviceId' | 'isAvailable' | 'walkInPrice'
>;

@Injectable()
export class BranchCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async assertOpenBranch(branchId: string): Promise<StaffLocation> {
    const branch = await this.prisma.staffLocation.findUnique({
      where: { id: branchId },
    });

    if (!branch?.isActive) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async listOpenBranches(queryDto: QueryBranchesDto) {
    const cacheKey = `branches:open:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { search } = queryDto;
    const branches = await this.prisma.staffLocation.findMany({
      where: {
        isActive: true,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        address: true,
        _count: {
          select: {
            branchServices: {
              where: { isAvailable: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      address: branch.address,
      serviceCount: branch._count.branchServices,
    }));

    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async getOpenBranch(id: string) {
    const cacheKey = `branches:open:one:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return cached;
    }

    const branch = await this.prisma.staffLocation.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        name: true,
        address: true,
        _count: {
          select: {
            branchServices: {
              where: { isAvailable: true },
            },
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const result = {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      serviceCount: branch._count.branchServices,
    };

    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async getAvailableAssignmentsMap(
    branchId: string,
  ): Promise<Map<string, BranchAssignmentRecord>> {
    const rows = await this.prisma.branchService.findMany({
      where: { branchId, isAvailable: true },
      select: {
        serviceId: true,
        isAvailable: true,
        walkInPrice: true,
      },
    });

    return new Map(rows.map((row) => [row.serviceId, row]));
  }

  async getAssignmentForService(branchId: string, serviceId: string) {
    return this.prisma.branchService.findUnique({
      where: {
        branchId_serviceId: { branchId, serviceId },
      },
      select: {
        serviceId: true,
        isAvailable: true,
        walkInPrice: true,
      },
    });
  }
}