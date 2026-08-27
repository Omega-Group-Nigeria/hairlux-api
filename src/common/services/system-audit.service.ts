import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';


@Injectable()
export class SystemAuditService {
    constructor(private readonly prisma: PrismaService) { }

    async log(params: {
        action: string;
        entityType: string;
        entityId: string;
        staffId?: string;
        actorId?: string;
        note?: string;
        before?: unknown;
        after?: unknown;
    }) {
        try {
            await this.prisma.systemAuditLog.create({
                data: {
                    action: params.action,
                    entityType: params.entityType,
                    entityId: params.entityId,
                    staffId: params.staffId,
                    actorId: params.actorId,
                    note: params.note,
                    before: params.before as any,
                    after: params.after as any,
                },
            });
        } catch {
            // Deliberately swallowed -- see class doc comment.
        }
    }

    async findAll(filters: { entityType?: string; entityId?: string; staffId?: string; actorId?: string; action?: string; page?: number; limit?: number }) {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 50;
        const where = {
            ...(filters.entityType && { entityType: filters.entityType }),
            ...(filters.entityId && { entityId: filters.entityId }),
            ...(filters.staffId && { staffId: filters.staffId }),
            ...(filters.actorId && { actorId: filters.actorId }),
            ...(filters.action && { action: filters.action }),
        };

        const [data, total] = await Promise.all([
            this.prisma.systemAuditLog.findMany({
                where,
                include: {
                    actor: { select: { id: true, name: true, staffCode: true } },
                    staff: { select: { id: true, name: true, staffCode: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.systemAuditLog.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}