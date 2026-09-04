import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollAuditService } from './payroll-audit.service';
import { PayrollEngineService } from './payroll-engine.service';

@Injectable()
export class PayrollReleaseService {
    private readonly logger = new Logger(PayrollReleaseService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly payrollAuditService: PayrollAuditService,
        private readonly payrollEngineService: PayrollEngineService,
    ) { }

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

    /** Dev Feedback Round 8: flat, admin-configurable rate replacing the old progressive PAYE-band calculation -- see PayrollSettings.taxRate's own schema comment. */
    async setTaxRate(rate: number) {
        const settings = await this.getSettings();
        return this.prisma.payrollSettings.update({
            where: { id: settings.id },
            data: { taxRate: rate },
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

        // Dev Feedback Round 9: an adjustment (bonus, fine, etc.) added
        // after generatePayroll() ran but before approval used to sit in
        // the database, correctly linked to this period/staff, but never
        // actually get folded into the payslip -- nothing between
        // generation and approval ever recomputed anything, so the
        // published figures stayed frozen at whatever they were the
        // moment payroll was generated, silently missing any adjustment
        // added in between. The only way to pick it up was a full manual
        // "Recalculate" or a post-release correction after the fact.
        // Reusing regeneratePayslipForStaff here (same recompute + wallet-
        // delta-reconciliation logic already proven for individual pre-
        // release recalculation) for every still-DRAFT payslip, right
        // before the period actually locks, closes that gap -- whatever
        // was added right up until the moment of approval is guaranteed
        // to be reflected in what gets published. Must run while the
        // period is still AWAITING_RELEASE, since regeneratePayslipForStaff
        // itself requires that status.
        //
        // Concurrent (Promise.allSettled), not sequential -- each staff
        // member's own wallet/payslip rows are independent of every other
        // staff member's, so there's no data-race risk running these
        // together, and a period with many staff no longer means a long
        // approval request made of dozens of round-trips back to back.
        //
        // Each staff member's recompute is individually caught and never
        // re-thrown -- this is a best-effort freshness pass, not a hard
        // prerequisite for approval. Letting one staff member's recompute
        // failure abort the whole operation would silently block
        // approving the ENTIRE period for everyone else too, worse than
        // approving with that one payslip's last-known-good figures (the
        // same figures approval would have published before this
        // recompute step existed at all) while still getting the benefit
        // for every other staff member whose recompute succeeds. Failures
        // are logged so a genuinely broken payslip is still visible, not
        // swallowed entirely.
        const draftPayslips = await this.prisma.payslip.findMany({
            where: { payrollPeriodId: periodId, status: 'DRAFT' },
            select: { staffId: true },
        });
        await Promise.allSettled(
            draftPayslips.map(({ staffId }: { staffId: string }) =>
                this.payrollEngineService.regeneratePayslipForStaff(
                    periodId, staffId, approvedById, 'Final recalculation at approval',
                ).catch((err) => {
                    this.logger.error(
                        `Failed to recompute payslip for staff ${staffId} in period ${periodId} during approval -- proceeding with its last-known-good figures`,
                        err instanceof Error ? err.stack : String(err),
                    );
                }),
            ),
        );

        const updated = await this.prisma.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'RELEASED', approvedAt: new Date(), approvedById, releasedAt: new Date(), releasedById: approvedById },
        });

        // Payroll System Developer Implementation Guide, section 15/12: a
        // payslip is only ever displayed to staff "after payroll is
        // finalized and published" -- period approval IS that finalization
        // step, so every payslip generated under it publishes together,
        // right here, rather than needing a separate, third publish action.
        // Only DRAFT payslips flip -- none should exist in any other status
        // at this point, but the guard keeps this idempotent regardless.
        const toPublish = await this.prisma.payslip.findMany({
            where: { payrollPeriodId: periodId, status: 'DRAFT' },
            select: { id: true, staffId: true },
        });
        if (toPublish.length) {
            await this.prisma.payslip.updateMany({
                where: { id: { in: toPublish.map((p: { id: string; staffId: string }) => p.id) } },
                data: { status: 'PUBLISHED', publishedAt: new Date() },
            });
            // "Publication" is its own auditable event per the guide,
            // distinct from generation -- logged per payslip (not just
            // once at the period level) so "when was THIS staff member's
            // payslip actually published" is directly answerable.
            for (const p of toPublish) {
                await this.payrollAuditService.log({
                    action: 'PAYSLIP_PUBLISHED',
                    entityType: 'Payslip',
                    entityId: p.id,
                    staffId: p.staffId,
                    actorId: approvedById,
                });
            }
        }

        await this.payrollAuditService.log({
            action: 'PERIOD_APPROVED',
            entityType: 'PayrollPeriod',
            entityId: periodId,
            actorId: approvedById,
            before: { status: period.status },
            after: { status: updated.status },
        });

        return updated;
    }

    /**
     * Dev Feedback Round 4, item #22. Sends an AWAITING_RELEASE period
     * back to DRAFT so it can be reviewed and corrected -- reuses the
     * existing DRAFT status rather than introducing a new one, since
     * PayrollEngineService.generatePayroll() already only runs against
     * DRAFT periods and already upserts payslips (never duplicates them
     * on a second run), so "back to Draft" already has everything needed
     * to support a genuine correction workflow without any further
     * state-machine changes. Gated by the PAYROLL_CORRECT permission at
     * the controller layer -- deliberately a higher bar than ordinary
     * PAYROLL_MANAGE access.
     */
    async requestCorrection(periodId: string, actorId: string | undefined, note: string | undefined) {
        const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
        if (!period) throw new NotFoundException('Payroll period not found');
        if (period.status !== 'AWAITING_RELEASE') {
            throw new BadRequestException('Only a period awaiting approval can be sent back for correction');
        }

        const updated = await this.prisma.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'DRAFT', generatedAt: null, generatedById: null },
        });

        await this.payrollAuditService.log({
            action: 'SENT_FOR_CORRECTION',
            entityType: 'PayrollPeriod',
            entityId: periodId,
            actorId,
            note,
            before: { status: period.status },
            after: { status: updated.status },
        });

        return updated;
    }
}