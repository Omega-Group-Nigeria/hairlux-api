import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetCompensationDto } from './dto/set-compensation.dto';

@Injectable()
export class StaffCompensationService {
    constructor(private readonly prisma: PrismaService) { }

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

        return updated;
    }

    async getCurrentCompensation(staffId: string) {
        const staff = await this.prisma.staff.findUnique({
            where: { id: staffId },
            select: { currentBaseSalary: true, currentAllowances: true },
        });
        if (!staff) throw new NotFoundException('Staff member not found');
        return staff;
    }

    async getHistory(staffId: string) {
        return this.prisma.staffCompensationHistory.findMany({
            where: { staffId },
            include: { changedBy: { select: { id: true, name: true } } },
            orderBy: { effectiveDate: 'desc' },
        });
    }
}