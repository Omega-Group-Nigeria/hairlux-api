import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollReleaseService {
    constructor(private readonly prisma: PrismaService) { }

    async getSettings() {
        const existing = await this.prisma.payrollSettings.findFirst();
        if (existing) return existing;
        return this.prisma.payrollSettings.create({ data: {} });
    }

    /**
     * The "Payday" switch. ON immediately unlocks every AWAITING_RELEASE
     * period's wallet credits for withdrawal (see StaffPayoutService, which
     * checks this flag before allowing any withdrawal request). OFF locks
     * everything again — wallet balances themselves are untouched either
     * way, only the ability to withdraw is gated.
     */
    async setReleaseActive(active: boolean) {
        const settings = await this.getSettings();
        return this.prisma.payrollSettings.update({
            where: { id: settings.id },
            data: { releaseActive: active },
        });
    }

    async setPensionRate(rate: number) {
        const settings = await this.getSettings();
        return this.prisma.payrollSettings.update({
            where: { id: settings.id },
            data: { pensionRate: rate },
        });
    }

    /**
     * A formal admin sign-off on an already-generated period — a review
     * checkpoint distinct from the wallet crediting, which already happened
     * at generation time. This does NOT touch wallet balances again (that
     * would double-credit). Whether staff can actually withdraw what's
     * already in their wallet is governed separately by the global Payday
     * switch (setReleaseActive) — a single aggregate wallet balance can't
     * practically be split by "which period contributed this portion", so
     * that switch is the real mechanical gate; this status transition is
     * the audit trail of "an admin reviewed and signed off on this run".
     */
    async approvePeriod(periodId: string, approvedById: string | undefined) {
        const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Payroll period not found');
        if (period.status !== 'AWAITING_RELEASE') {
            throw new BadRequestException('Only a period awaiting approval can be approved');
        }

        return this.prisma.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'RELEASED', approvedAt: new Date(), approvedById, releasedAt: new Date(), releasedById: approvedById },
        });
    }
}