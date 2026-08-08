import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  ) { }

  // ── Permission catalogue ─────────────────────────────────────────────────────

  getPermissionCatalogue() {
    return {
      total: ALL_PERMISSION_VALUES.length,
      groups: PERMISSION_GROUPS,
    };
  }

  // ── Role CRUD ────────────────────────────────────────────────────────────────

  async create(dto: CreateRoleDto, actorId: string | undefined) {
    const existing = await this.prisma.adminRole.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`A role named "${dto.name}" already exists`);
    }

    const role = await this.prisma.adminRole.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: { permissions: true },
    });

    await this.logAudit('ROLE_CREATED', role.id, role.name, actorId, {
      before: null,
      after: { name: role.name, description: role.description },
    });

    return role;
  }

  async findAll() {
    const roles = await this.prisma.adminRole.findMany({
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true, additionalUsers: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: r.isActive,
      permissions: r.permissions.map((p) => p.permission),
      userCount: r._count.users + r._count.additionalUsers,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true, additionalUsers: true } },
      },
    });

    if (!role) throw new NotFoundException('Admin role not found');

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users + role._count.additionalUsers,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async getRoleUsers(id: string) {
    const role = await this.findOne(id);

    const [primaryUsers, secondaryUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: { adminRoleId: id },
        select: { id: true, firstName: true, lastName: true, email: true, status: true },
      }),
      this.prisma.userAdminRole.findMany({
        where: { adminRoleId: id },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, status: true } },
        },
      }),
    ]);

    return {
      roleId: role.id,
      roleName: role.name,
      primary: primaryUsers,
      secondary: secondaryUsers.map((s) => ({ ...s.user, assignedAt: s.assignedAt })),
    };
  }

  async update(id: string, dto: UpdateRoleDto, actorId: string | undefined) {
    const before = await this.findOne(id);

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
        _count: { select: { users: true, additionalUsers: true } },
      },
    });

    // isActive changes affect who can act right now — bust the cache
    // immediately rather than waiting out the TTL.
    if (dto.isActive !== undefined && dto.isActive !== before.isActive) {
      await this.invalidatePermissionCache(id);
    }

    await this.logAudit('ROLE_UPDATED', role.id, role.name, actorId, {
      before: { name: before.name, description: before.description, isActive: before.isActive },
      after: { name: role.name, description: role.description, isActive: role.isActive },
    });

    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isActive: role.isActive,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users + role._count.additionalUsers,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async remove(id: string, actorId: string | undefined) {
    const role = await this.findOne(id);

    if (role.userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" — it is currently assigned to ${role.userCount} user(s). Reassign them first.`,
      );
    }

    await this.prisma.adminRole.delete({ where: { id } });
    await this.invalidatePermissionCache(id);

    await this.logAudit('ROLE_DELETED', null, role.name, actorId, {
      before: { name: role.name, description: role.description, permissions: role.permissions },
      after: null,
    });
  }

  // ── Permission assignment ────────────────────────────────────────────────────

  async setPermissions(roleId: string, dto: SetRolePermissionsDto, actorId: string | undefined) {
    const before = await this.findOne(roleId);

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

    await this.logAudit('PERMISSIONS_CHANGED', roleId, before.name, actorId, {
      before: before.permissions,
      after: dto.permissions,
    });

    return this.findOne(roleId);
  }

  // ── Secondary roles (multi-role support) ─────────────────────────────────────

  async getUserRoles(userId: string) {
    const [user, additional] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, adminRole: { select: { id: true, name: true, isActive: true } } },
      }),
      this.prisma.userAdminRole.findMany({
        where: { userId },
        include: { adminRole: { select: { id: true, name: true, isActive: true } } },
        orderBy: { assignedAt: 'asc' },
      }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    return {
      primary: user.adminRole,
      additional: additional.map((a) => ({ ...a.adminRole, assignedAt: a.assignedAt })),
    };
  }

  async addUserRole(userId: string, adminRoleId: string, actorId: string | undefined) {
    const [user, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.findOne(adminRoleId),
    ]);
    if (!user) throw new NotFoundException('User not found');

    if (user.adminRoleId === adminRoleId) {
      throw new BadRequestException(`"${role.name}" is already this user's primary role`);
    }

    const existing = await this.prisma.userAdminRole.findUnique({
      where: { userId_adminRoleId: { userId, adminRoleId } },
    });
    if (existing) {
      throw new ConflictException(`This user already has the "${role.name}" role`);
    }

    await this.prisma.userAdminRole.create({
      data: { userId, adminRoleId, assignedById: actorId },
    });
    await this.redis.del(`user:profile:${userId}`);

    await this.logAudit('USER_ROLE_ADDED', adminRoleId, role.name, actorId, {
      before: null,
      after: { targetUserId: userId },
    }, userId);

    return this.getUserRoles(userId);
  }

  async removeUserRole(userId: string, adminRoleId: string, actorId: string | undefined) {
    const role = await this.findOne(adminRoleId);

    const existing = await this.prisma.userAdminRole.findUnique({
      where: { userId_adminRoleId: { userId, adminRoleId } },
    });
    if (!existing) {
      throw new NotFoundException(`This user does not have the "${role.name}" role`);
    }

    await this.prisma.userAdminRole.delete({ where: { id: existing.id } });
    await this.redis.del(`user:profile:${userId}`);

    await this.logAudit('USER_ROLE_REMOVED', adminRoleId, role.name, actorId, {
      before: { targetUserId: userId },
      after: null,
    }, userId);

    return this.getUserRoles(userId);
  }

  // ── Audit trail ──────────────────────────────────────────────────────────────

  async getAuditLog(params: { adminRoleId?: string; targetUserId?: string; page?: number; limit?: number }) {
    const { adminRoleId, targetUserId, page = 1, limit = 50 } = params;
    const where: Record<string, unknown> = {};
    if (adminRoleId) where.adminRoleId = adminRoleId;
    if (targetUserId) where.targetUserId = targetUserId;

    const [data, total] = await Promise.all([
      this.prisma.roleAuditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
          targetUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.roleAuditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  private async logAudit(
    action: 'ROLE_CREATED' | 'ROLE_UPDATED' | 'ROLE_DELETED' | 'PERMISSIONS_CHANGED' | 'USER_ROLE_ASSIGNED' | 'USER_ROLE_ADDED' | 'USER_ROLE_REMOVED',
    adminRoleId: string | null,
    roleName: string,
    actorId: string | undefined,
    change: { before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null },
    targetUserId?: string,
  ) {
    await this.prisma.roleAuditLog.create({
      data: {
        action,
        adminRoleId,
        roleName,
        targetUserId: targetUserId ?? null,
        actorId: actorId ?? null,
        before: change.before === null ? Prisma.JsonNull : change.before,
        after: change.after === null ? Prisma.JsonNull : change.after,
      },
    });
  }

  // ── Cache helper ─────────────────────────────────────────────────────────────

  async invalidatePermissionCache(adminRoleId: string) {
    await this.redis.del(`permissions:adminrole:${adminRoleId}`);
  }
}