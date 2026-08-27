import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Dev Feedback Round 4, items #22-24. Every other payroll service calls
 * log() at the point an action actually succeeds -- deliberately never
 * thrown from here: a logging failure must never roll back or block the
 * real action it's describing. If the write itself fails, that's a
 * genuine gap in the trail, but the payroll action it was recording
 * still needs to stand.
 */
@Injectable()
export class PayrollAuditService {
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
            await this.prisma.payrollAuditLog.create({
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
            this.prisma.payrollAuditLog.findMany({
                where,
                include: {
                    actor: { select: { id: true, name: true, staffCode: true } },
                    staff: { select: { id: true, name: true, staffCode: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.payrollAuditLog.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }
}