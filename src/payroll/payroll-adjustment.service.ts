import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';
import { PayrollAuditService } from './payroll-audit.service';

@Injectable()
export class PayrollAdjustmentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payrollAuditService: PayrollAuditService,
    ) { }

    /**
     * Every adjustment is tied to a specific period so it flows into that
     * period's payroll run. If the period has already been generated
     * (AWAITING_RELEASE or later), adding a new adjustment here won't
     * retroactively change an existing payslip — the period needs
     * regenerating (only possible while still DRAFT) for it to take effect.
     */
    async create(dto: CreatePayrollAdjustmentDto, periodId: string, createdById: string | undefined) {
        const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Payroll period not found');

        const staff = await this.prisma.staff.findUnique({ where: { id: dto.staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const created = await this.prisma.payrollAdjustment.create({
            data: {
                payrollPeriodId: periodId,
                staffId: dto.staffId,
                type: dto.type,
                category: dto.category,
                amount: dto.amount,
                reason: dto.reason,
                createdById,
            },
        });

        await this.payrollAuditService.log({
            action: 'ADJUSTMENT_CREATED',
            entityType: 'PayrollAdjustment',
            entityId: created.id,
            staffId: dto.staffId,
            actorId: createdById,
            after: { type: dto.type, category: dto.category, amount: dto.amount, reason: dto.reason },
        });

        return created;
    }

    async listForPeriod(periodId: string) {
        return this.prisma.payrollAdjustment.findMany({
            where: { payrollPeriodId: periodId },
            include: { staff: { select: { id: true, name: true, staffCode: true } }, createdBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async listForStaff(staffId: string) {
        return this.prisma.payrollAdjustment.findMany({
            where: { staffId },
            include: { payrollPeriod: { select: { id: true, label: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async remove(id: string, removedById: string | undefined) {
        const adjustment = await this.prisma.payrollAdjustment.findUnique({
            where: { id },
            include: { payrollPeriod: true },
        });
        if (!adjustment) throw new NotFoundException('Adjustment not found');
        if (adjustment.payrollPeriod.status !== 'DRAFT') {
            throw new BadRequestException('Cannot remove an adjustment once its payroll period has been generated — the payslip is already final');
        }

        await this.prisma.payrollAdjustment.delete({ where: { id } });

        await this.payrollAuditService.log({
            action: 'ADJUSTMENT_REMOVED',
            entityType: 'PayrollAdjustment',
            entityId: id,
            staffId: adjustment.staffId,
            actorId: removedById,
            before: { type: adjustment.type, category: adjustment.category, amount: adjustment.amount, reason: adjustment.reason },
        });

        return { deleted: true, id };
    }
}