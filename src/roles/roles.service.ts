import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import {
  ALL_PERMISSION_VALUES,
  PERMISSION_GROUPS,
} from '../common/constants/permissions';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ── Permission catalogue ─────────────────────────────────────────────────────

  getPermissionCatalogue() {
    return {
      total: ALL_PERMISSION_VALUES.length,
      groups: PERMISSION_GROUPS,
    };
  }

  // ── Role CRUD ────────────────────────────────────────────────────────────────

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.adminRole.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists`);
    }

    return this.prisma.adminRole.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: { permissions: true },
    });
  }

  async findAll() {
    const roles = await this.prisma.adminRole.findMany({
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      permissions: r.permissions.map((p) => p.permission),
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    if (!role) throw new NotFoundException('Admin role not found');

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async update(id: string, dto: UpdateRoleDto) {
    await this.findOne(id);

    if (dto.name) {
      const conflict = await this.prisma.adminRole.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `A role named "${dto.name}" already exists`,
        );
      }
    }

    const role = await this.prisma.adminRole.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    if (role.userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" — it is currently assigned to ${role.userCount} user(s). Reassign them first.`,
      );
    }

    await this.prisma.adminRole.delete({ where: { id } });
    await this.invalidatePermissionCache(id);
  }

  // ── Permission assignment ────────────────────────────────────────────────────

  async setPermissions(roleId: string, dto: SetRolePermissionsDto) {
    await this.findOne(roleId);

    // Validate all permissions exist in the catalogue
    const invalid = dto.permissions.filter(
      (p) => !(ALL_PERMISSION_VALUES as readonly string[]).includes(p),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Unknown permission(s): ${invalid.join(', ')}`,
      );
    }

    // Replace entire permission set atomically
    await this.prisma.$transaction([
      this.prisma.adminRolePermission.deleteMany({
        where: { adminRoleId: roleId },
      }),
      ...(dto.permissions.length > 0
        ? [
            this.prisma.adminRolePermission.createMany({
              data: dto.permissions.map((permission) => ({
                adminRoleId: roleId,
                permission,
              })),
            }),
          ]
        : []),
    ]);

    // Bust the permissions cache for this role so the next request re-fetches
    await this.invalidatePermissionCache(roleId);

    return this.findOne(roleId);
  }

  // ── Cache helper ─────────────────────────────────────────────────────────────

  async invalidatePermissionCache(adminRoleId: string) {
    await this.redis.del(`permissions:adminrole:${adminRoleId}`);
  }
}
