import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditTrailSource = 'ROLE' | 'PAYROLL' | 'SYSTEM';

export interface AuditTrailEntry {
    id: string; // prefixed by source ("role:<uuid>") -- the three underlying tables don't share an id space
    source: AuditTrailSource;
    action: string;
    entityType: string;
    entityId: string | null;
    actorId: string | null;
    actorName: string | null;
    subjectId: string | null; // the staff/user the action concerns, when the action has one distinct from the actor
    subjectName: string | null;
    note: string | null;
    before: unknown;
    after: unknown;
    createdAt: Date;
}

export interface AuditTrailFilters {
    source?: AuditTrailSource;
    entityType?: string;
    actorId?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
}

/**
 * Item 3 (Audit Trail), first half of the two-part "flagged non-negotiable
 * in the original SRS docs, never built" gap. The write-side logging
 * infrastructure already existed and was already wired into several
 * modules (attendance, lifecycle campaigns, vendor ledger, payroll,
 * commission plans, document types, discounts) across three separate
 * tables -- RoleAuditLog, PayrollAuditLog, SystemAuditLog -- but NONE of
 * the three had any admin-facing read endpoint at all. This service is
 * that missing read side: merges all three into one normalized,
 * chronological, filterable view rather than three separate viewers.
 *
 * Pagination note: Prisma has no cross-model UNION, so this fetches up to
 * page*limit rows from each of the three tables (capped -- see MAX_FETCH),
 * merges and sorts in memory, then slices to the requested page. Fine for
 * an audit log's realistic usage pattern (recent-first, rarely paginated
 * deep); the cap exists so a pathological page/limit combination can't
 * force a huge fetch. Total counts come from a separate, cheap
 * .count() per table, not from the fetched rows.
 */
@Injectable()
export class AuditTrailService {
    private static readonly MAX_FETCH_PER_SOURCE = 1000;

    constructor(private readonly prisma: PrismaService) { }

    async findAll(filters: AuditTrailFilters) {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 50;
        const fetchCount = Math.min(page * limit, AuditTrailService.MAX_FETCH_PER_SOURCE);

        const dateWhere = (filters.from || filters.to) ? {
            createdAt: {
                ...(filters.from && { gte: filters.from }),
                ...(filters.to && { lte: filters.to }),
            },
        } : {};

        const wantRole = !filters.source || filters.source === 'ROLE';
        const wantPayroll = !filters.source || filters.source === 'PAYROLL';
        const wantSystem = !filters.source || filters.source === 'SYSTEM';

        const roleWhere = { ...dateWhere, ...(filters.actorId && { actorId: filters.actorId }) };
        // entityType doesn't apply to RoleAuditLog (it only ever covers
        // AdminRole/User-role actions) -- a filter for it there would
        // just return nothing, so skip that source entirely rather than
        // silently return an empty, misleading slice.
        const roleApplies = wantRole && !filters.entityType;

        const payrollWhere = {
            ...dateWhere,
            ...(filters.actorId && { actorId: filters.actorId }),
            ...(filters.entityType && { entityType: filters.entityType }),
        };
        const systemWhere = {
            ...dateWhere,
            ...(filters.actorId && { actorId: filters.actorId }),
            ...(filters.entityType && { entityType: filters.entityType }),
        };

        const [roleRows, payrollRows, systemRows, roleTotal, payrollTotal, systemTotal] = await Promise.all([
            roleApplies
                ? this.prisma.roleAuditLog.findMany({
                    where: roleWhere,
                    include: { actor: { select: { id: true, firstName: true, lastName: true } }, targetUser: { select: { id: true, firstName: true, lastName: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: fetchCount,
                })
                : Promise.resolve([]),
            wantPayroll
                ? this.prisma.payrollAuditLog.findMany({
                    where: payrollWhere,
                    include: { actor: { select: { id: true, name: true } }, staff: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: fetchCount,
                })
                : Promise.resolve([]),
            wantSystem
                ? this.prisma.systemAuditLog.findMany({
                    where: systemWhere,
                    include: { actor: { select: { id: true, name: true } }, staff: { select: { id: true, name: true } } },
                    orderBy: { createdAt: 'desc' },
                    take: fetchCount,
                })
                : Promise.resolve([]),
            roleApplies ? this.prisma.roleAuditLog.count({ where: roleWhere }) : Promise.resolve(0),
            wantPayroll ? this.prisma.payrollAuditLog.count({ where: payrollWhere }) : Promise.resolve(0),
            wantSystem ? this.prisma.systemAuditLog.count({ where: systemWhere }) : Promise.resolve(0),
        ]);

        const normalized: AuditTrailEntry[] = [
            ...roleRows.map((r: any): AuditTrailEntry => ({
                id: `role:${r.id}`,
                source: 'ROLE',
                action: r.action,
                entityType: 'AdminRole',
                entityId: r.adminRoleId,
                actorId: r.actorId,
                actorName: r.actor ? `${r.actor.firstName} ${r.actor.lastName}` : null,
                subjectId: r.targetUserId,
                subjectName: r.targetUser ? `${r.targetUser.firstName} ${r.targetUser.lastName}` : null,
                note: r.roleName ? `Role: ${r.roleName}` : null,
                before: r.before,
                after: r.after,
                createdAt: r.createdAt,
            })),
            ...payrollRows.map((r: any): AuditTrailEntry => ({
                id: `payroll:${r.id}`,
                source: 'PAYROLL',
                action: r.action,
                entityType: r.entityType,
                entityId: r.entityId,
                actorId: r.actorId,
                actorName: r.actor?.name ?? null,
                subjectId: r.staffId,
                subjectName: r.staff?.name ?? null,
                note: r.note,
                before: r.before,
                after: r.after,
                createdAt: r.createdAt,
            })),
            ...systemRows.map((r: any): AuditTrailEntry => ({
                id: `system:${r.id}`,
                source: 'SYSTEM',
                action: r.action,
                entityType: r.entityType,
                entityId: r.entityId,
                actorId: r.actorId,
                actorName: r.actor?.name ?? null,
                subjectId: r.staffId,
                subjectName: r.staff?.name ?? null,
                note: r.note,
                before: r.before,
                after: r.after,
                createdAt: r.createdAt,
            })),
        ];

        normalized.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        const total = roleTotal + payrollTotal + systemTotal;
        const start = (page - 1) * limit;
        const data = normalized.slice(start, start + limit);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    /** Distinct entityType values actually in use, for a filter dropdown -- PayrollAuditLog + SystemAuditLog only (see findAll's roleApplies note). */
    async listEntityTypes() {
        const [payrollTypes, systemTypes] = await Promise.all([
            this.prisma.payrollAuditLog.findMany({ distinct: ['entityType'], select: { entityType: true } }),
            this.prisma.systemAuditLog.findMany({ distinct: ['entityType'], select: { entityType: true } }),
        ]);
        const set = new Set<string>();
        payrollTypes.forEach((t: any) => set.add(t.entityType));
        systemTypes.forEach((t: any) => set.add(t.entityType));
        return Array.from(set).sort();
    }
}