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
                effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
                notes: dto.notes,
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

    /**
     * Dev Feedback Round 5, item #3: "support corrections of the final
     * amount with an audit trail showing the original amount, revised
     * amount, reason, user, and timestamp." Only the amount changes on
     * the new row -- type/category/staff/original reason/effectiveDate/
     * notes all carry over from the record being corrected. Deliberately
     * scoped to adjustments whose period is past DRAFT -- a still-draft
     * adjustment hasn't been finalized into any payslip yet, so
     * remove() + create() already covers that case without needing a
     * formal, audited correction.
     */
    async correct(id: string, newAmount: number, correctionReason: string, actorId: string | undefined) {
        const original = await this.prisma.payrollAdjustment.findUnique({
            where: { id },
            include: { payrollPeriod: true },
        });
        if (!original) throw new NotFoundException('Adjustment not found');
        if (original.status !== 'ACTIVE') {
            throw new BadRequestException('Only an active adjustment can be corrected -- it has already been superseded by a later correction');
        }
        if (original.payrollPeriod.status === 'DRAFT') {
            throw new BadRequestException('This adjustment\'s period is still in Draft -- edit it directly (remove and re-add) rather than issuing a formal correction');
        }

        const [, corrected] = await this.prisma.$transaction([
            this.prisma.payrollAdjustment.update({
                where: { id: original.id },
                data: { status: 'SUPERSEDED' },
            }),
            this.prisma.payrollAdjustment.create({
                data: {
                    payrollPeriodId: original.payrollPeriodId,
                    payslipId: original.payslipId,
                    staffId: original.staffId,
                    type: original.type,
                    category: original.category,
                    amount: newAmount,
                    reason: original.reason,
                    effectiveDate: original.effectiveDate,
                    notes: original.notes,
                    status: 'ACTIVE',
                    supersedesId: original.id,
                    correctionReason,
                    createdById: actorId,
                },
            }),
        ]);

        await this.payrollAuditService.log({
            action: 'ADJUSTMENT_CORRECTED',
            entityType: 'PayrollAdjustment',
            entityId: corrected.id,
            staffId: original.staffId,
            actorId,
            before: { amount: original.amount },
            after: { amount: newAmount, correctionReason },
        });

        return corrected;
    }

    async listForPeriod(periodId: string) {
        return this.prisma.payrollAdjustment.findMany({
            where: { payrollPeriodId: periodId, status: 'ACTIVE' },
            include: { staff: { select: { id: true, name: true, staffCode: true, locationId: true, location: { select: { name: true } } } }, createdBy: { select: { id: true, name: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    async listForStaff(staffId: string) {
        return this.prisma.payrollAdjustment.findMany({
            where: { staffId, status: 'ACTIVE' },
            include: { payrollPeriod: { select: { id: true, label: true } } },
            orderBy: { createdAt: 'desc' },
        });
    }

    /** Full chain for one adjustment -- the original plus every correction issued against it, oldest first. */
    async getCorrectionHistory(id: string) {
        const adjustment = await this.prisma.payrollAdjustment.findUnique({ where: { id } });
        if (!adjustment) throw new NotFoundException('Adjustment not found');

        // Walk backward via supersedesId to the true original, then
        // forward again collecting every row in the chain -- the id
        // passed in could itself be any link in the chain, not
        // necessarily the first or the last.
        let rootId = adjustment.id;
        let cursor: any = adjustment;
        while (cursor.supersedesId) {
            cursor = await this.prisma.payrollAdjustment.findUnique({ where: { id: cursor.supersedesId } });
            if (!cursor) break;
            rootId = cursor.id;
        }

        const chain: any[] = [];
        let nextId: string | null = rootId;
        while (nextId) {
            const row: any = await this.prisma.payrollAdjustment.findUnique({
                where: { id: nextId },
                include: { createdBy: { select: { id: true, name: true } } },
            });
            if (!row) break;
            chain.push(row);
            const child: any = await this.prisma.payrollAdjustment.findFirst({ where: { supersedesId: row.id } });
            nextId = child ? child.id : null;
        }

        return chain;
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