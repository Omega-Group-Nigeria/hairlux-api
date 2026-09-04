import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAuditService } from '../common/services/system-audit.service';

interface UpsertCommissionPlanInput {
    name: string;
    commissionRate: number;
    eligibleServiceIds?: string[];
    applicableBranchId?: string | null;
    applicableRole?: string | null;
    effectiveDate: string;
    requiresApproval?: boolean;
    isActive?: boolean;
}

@Injectable()
export class CommissionPlanService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    async findAll(filters: { isActive?: boolean; branchId?: string }) {
        return this.prisma.commissionPlan.findMany({
            where: {
                ...(filters.isActive !== undefined && { isActive: filters.isActive }),
                ...(filters.branchId && { applicableBranchId: filters.branchId }),
            },
            include: { applicableBranch: { select: { id: true, name: true } }, _count: { select: { assignedStaff: true } } },
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: string) {
        const plan = await this.prisma.commissionPlan.findUnique({
            where: { id },
            include: { applicableBranch: { select: { id: true, name: true } }, _count: { select: { assignedStaff: true } } },
        });
        if (!plan) throw new NotFoundException('Commission plan not found');
        return plan;
    }

    async create(dto: UpsertCommissionPlanInput, actorId: string | undefined) {
        const plan = await this.prisma.commissionPlan.create({
            data: {
                name: dto.name,
                commissionRate: dto.commissionRate,
                eligibleServiceIds: dto.eligibleServiceIds ?? [],
                applicableBranchId: dto.applicableBranchId,
                applicableRole: dto.applicableRole,
                effectiveDate: new Date(dto.effectiveDate),
                requiresApproval: dto.requiresApproval ?? false,
                isActive: dto.isActive ?? true,
            },
        });

        await this.systemAuditService.log({
            action: 'COMMISSION_PLAN_CREATED',
            entityType: 'CommissionPlan',
            entityId: plan.id,
            actorId,
            after: { name: plan.name, commissionRate: plan.commissionRate, isActive: plan.isActive },
        });

        return plan;
    }

    async update(id: string, dto: Partial<UpsertCommissionPlanInput>, actorId: string | undefined) {
        const before = await this.findOne(id);

        const updated = await this.prisma.commissionPlan.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.commissionRate !== undefined && { commissionRate: dto.commissionRate }),
                ...(dto.eligibleServiceIds !== undefined && { eligibleServiceIds: dto.eligibleServiceIds }),
                ...(dto.applicableBranchId !== undefined && { applicableBranchId: dto.applicableBranchId }),
                ...(dto.applicableRole !== undefined && { applicableRole: dto.applicableRole }),
                ...(dto.effectiveDate !== undefined && { effectiveDate: new Date(dto.effectiveDate) }),
                ...(dto.requiresApproval !== undefined && { requiresApproval: dto.requiresApproval }),
                ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            },
        });

        await this.systemAuditService.log({
            action: 'COMMISSION_PLAN_UPDATED',
            entityType: 'CommissionPlan',
            entityId: id,
            actorId,
            before: { name: before.name, commissionRate: before.commissionRate, isActive: before.isActive },
            after: { name: updated.name, commissionRate: updated.commissionRate, isActive: updated.isActive },
        });

        return updated;
    }

    async remove(id: string, actorId: string | undefined) {
        const plan = await this.prisma.commissionPlan.findUnique({
            where: { id },
            include: { _count: { select: { assignedStaff: true } } },
        });
        if (!plan) throw new NotFoundException('Commission plan not found');
        if (plan._count.assignedStaff > 0) {
            throw new BadRequestException(
                `Cannot delete "${plan.name}" -- ${plan._count.assignedStaff} staff member(s) are still assigned to it. Reassign them first.`,
            );
        }

        await this.prisma.commissionPlan.delete({ where: { id } });

        await this.systemAuditService.log({
            action: 'COMMISSION_PLAN_DELETED',
            entityType: 'CommissionPlan',
            entityId: id,
            actorId,
            before: { name: plan.name, commissionRate: plan.commissionRate },
        });
    }

    /**
     * Payroll Engine v2, Phase 4: assigns a compensation type and/or
     * Commission Plan to a staff member. Deliberately its own method
     * (not folded into StaffService's general update) -- gated by
     * payroll:assign_commission_plan, a dedicated permission separate
     * from general staff:update, since this directly affects pay.
     */
    async assignCompensation(staffId: string, dto: { compensationType?: string; commissionPlanId?: string | null }, actorId: string | undefined) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        if (dto.commissionPlanId) {
            const plan = await this.prisma.commissionPlan.findUnique({ where: { id: dto.commissionPlanId } });
            if (!plan) throw new BadRequestException('Commission plan not found');
            if (!plan.isActive) throw new BadRequestException('Cannot assign an inactive commission plan');
        }

        const updated = await this.prisma.staff.update({
            where: { id: staffId },
            data: {
                ...(dto.compensationType !== undefined && { compensationType: dto.compensationType as any }),
                ...(dto.commissionPlanId !== undefined && { commissionPlanId: dto.commissionPlanId }),
                
                ...(dto.compensationType === 'COMMISSION' && { currentBaseSalary: null, currentAllowances: null }),
            },
        });

        await this.systemAuditService.log({
            action: 'STAFF_COMPENSATION_ASSIGNED',
            entityType: 'Staff',
            entityId: staffId,
            staffId,
            actorId,
            before: { compensationType: staff.compensationType, commissionPlanId: staff.commissionPlanId },
            after: { compensationType: updated.compensationType, commissionPlanId: updated.commissionPlanId },
        });

        return updated;
    }
}