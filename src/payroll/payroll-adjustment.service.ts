import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePayrollAdjustmentDto } from './dto/create-payroll-adjustment.dto';

@Injectable()
export class PayrollAdjustmentService {
    constructor(private readonly prisma: PrismaService) { }

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

        return this.prisma.payrollAdjustment.create({
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

    async remove(id: string) {
        const adjustment = await this.prisma.payrollAdjustment.findUnique({
            where: { id },
            include: { payrollPeriod: true },
        });
        if (!adjustment) throw new NotFoundException('Adjustment not found');
        if (adjustment.payrollPeriod.status !== 'DRAFT') {
            throw new BadRequestException('Cannot remove an adjustment once its payroll period has been generated — the payslip is already final');
        }

        await this.prisma.payrollAdjustment.delete({ where: { id } });
        return { deleted: true, id };
    }
}