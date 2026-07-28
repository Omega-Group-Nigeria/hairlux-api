import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffService } from 'src/staff/staff.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CreateBranchDto } from '../dto/create-branch.dto';
import { QueryAdminBranchesDto } from '../dto/query-admin-branches.dto';
import { UpdateBranchDto } from '../dto/update-branch.dto';

const ACTIVE_STAFF_STATUSES = ['ACTIVE', 'ON_LEAVE', 'SUSPENDED'] as const;

@Injectable()
export class BranchLocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly staffService: StaffService,
  ) { }

  async create(dto: CreateBranchDto) {
    const existing = await this.prisma.staffLocation.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Branch with this name already exists');
    }

    const code = dto.code ?? (await this.staffService.suggestBranchCode(dto.name));
    const duplicateCode = await this.prisma.staffLocation.findFirst({
      where: { code },
      select: { id: true },
    });
    if (duplicateCode) {
      throw new ConflictException(
        `Branch code "${code}" is already in use — choose a different code`,
      );
    }

    const branch = await this.prisma.staffLocation.create({
      data: {
        name: dto.name,
        code,
        address: dto.address,
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        approvedRadiusMeters: dto.approvedRadiusMeters,
        ...(dto.lateGracePeriodMinutes !== undefined && { lateGracePeriodMinutes: dto.lateGracePeriodMinutes }),
      },
    });

    await this.invalidateBranchCaches();
    return branch;
  }

  async findAllAdmin(queryDto: QueryAdminBranchesDto) {
    const { search, includeInactive = false } = queryDto;

    return this.prisma.staffLocation.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneAdmin(id: string) {
    const branch = await this.prisma.staffLocation.findUnique({
      where: { id },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async update(id: string, dto: UpdateBranchDto) {
    await this.findOneAdmin(id);

    if (dto.name) {
      const duplicate = await this.prisma.staffLocation.findFirst({
        where: {
          id: { not: id },
          name: { equals: dto.name, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Branch with this name already exists');
      }
    }

    if (dto.code) {
      const duplicateCode = await this.prisma.staffLocation.findFirst({
        where: { id: { not: id }, code: dto.code },
        select: { id: true },
      });
      if (duplicateCode) {
        throw new ConflictException(
          `Branch code "${dto.code}" is already in use — choose a different code`,
        );
      }
    }

    if (dto.isActive === false) {
      const activeStaffCount = await this.prisma.staff.count({
        where: {
          locationId: id,
          employmentStatus: { in: [...ACTIVE_STAFF_STATUSES] },
        },
      });

      if (activeStaffCount > 0) {
        throw new ConflictException(
          'Cannot close branch with active staff assigned',
        );
      }
    }

    const branch = await this.prisma.staffLocation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.gpsLat !== undefined && { gpsLat: dto.gpsLat }),
        ...(dto.gpsLng !== undefined && { gpsLng: dto.gpsLng }),
        ...(dto.approvedRadiusMeters !== undefined && { approvedRadiusMeters: dto.approvedRadiusMeters }),
        ...(dto.lateGracePeriodMinutes !== undefined && { lateGracePeriodMinutes: dto.lateGracePeriodMinutes }),
      },
    });

    await this.invalidateBranchCaches(id);
    return branch;
  }

  async remove(id: string) {
    await this.findOneAdmin(id);

    const staffCount = await this.prisma.staff.count({
      where: { locationId: id },
    });

    if (staffCount > 0) {
      throw new ConflictException(
        'Cannot delete branch because it is referenced by staff records',
      );
    }

    await this.prisma.staffLocation.delete({ where: { id } });
    await this.invalidateBranchCaches(id);
    return { message: 'Branch deleted successfully' };
  }

  private async invalidateBranchCaches(branchId?: string) {
    await Promise.all([
      this.redis.delByPattern('branches:open:*'),
      this.redis.delByPattern('branches:admin:*'),
      this.redis.delByPattern('staff:locations:*'),
      this.redis.delByPattern('services:list:*'),
      this.redis.delByPattern('services:one:*'),
      ...(branchId
        ? [this.redis.delByPattern(`branch-services:matrix:${branchId}`)]
        : [this.redis.delByPattern('branch-services:matrix:*')]),
    ]);
  }
}