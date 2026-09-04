import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from '../staff/staff.service';
import { SetCompensationDto } from './dto/set-compensation.dto';

@Injectable()
export class StaffCompensationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly staffService: StaffService,
    ) { }

    /**
     * Sets the staff member's current pay and records the change in history.
     * This is the ongoing figure Payroll reads from — distinct from
     * OfferLetter.baseSalary, a one-time pre-hire snapshot that was never
     * updated after someone actually started.
     */
    async setCompensation(staffId: string, dto: SetCompensationDto, changedById: string | undefined) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const [, updated] = await this.prisma.$transaction([
            this.prisma.staffCompensationHistory.create({
                data: {
                    staffId,
                    baseSalary: dto.baseSalary,
                    allowances: dto.allowances,
                    note: dto.note,
                    effectiveDate: new Date(dto.effectiveDate),
                    changedById,
                },
            }),
            this.prisma.staff.update({
                where: { id: staffId },
                data: {
                    currentBaseSalary: dto.baseSalary,
                    currentAllowances: dto.allowances,
                },
            }),
        ]);

        await this.staffService.invalidateCache(staffId);

        return updated;
    }

    async getCurrentCompensation(staffId: string) {
        const staff = await this.prisma.staff.findUnique({
            where: { id: staffId },
            select: { currentBaseSalary: true, currentAllowances: true, compensationType: true },
        });
        if (!staff) throw new NotFoundException('Staff member not found');

        if (staff.compensationType !== 'COMMISSION') return staff;

        const startOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const agg = await this.prisma.salonBookingCommission.aggregate({
            where: { staffId, calculatedAt: { gte: startOfThisMonth } },
            _sum: { amount: true },
        });

        return { ...staff, commissionThisMonth: Number(agg._sum.amount ?? 0) };
    }

    async getHistory(staffId: string) {
        return this.prisma.staffCompensationHistory.findMany({
            where: { staffId },
            include: { changedBy: { select: { id: true, name: true } } },
            orderBy: { effectiveDate: 'desc' },
        });
    }
}