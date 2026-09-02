import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { PayrollAuditService } from './payroll-audit.service';

@Injectable()
export class StaffPayoutService {
    private readonly logger = new Logger(StaffPayoutService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly paystackService: PaystackService,
        private readonly payrollAuditService: PayrollAuditService,
    ) { }

    /**
 * Self-service withdrawal — once the global Payday switch is on, staff
 * can withdraw all or part of their wallet balance, as many times as
 * they like until it reaches zero. The debit only happens on confirmed
 * Paystack success (see completeTransfer) so a failed transfer never
 * needs a manual balance correction — nothing was taken in the first
 * place.
 *
 * Race fix: the balance check and the PROCESSING row that reserves it
 * against future requests used to be two separate, unlocked reads --
 * two concurrent requests for the same staff (even for two DIFFERENT
 * amounts, so idempotency/dedup can't help) could both read the same
 * pre-request pendingAmount and both pass, together requesting more
 * than the actual balance. Wrapped in a transaction with a row lock
 * on the wallet (`FOR UPDATE`, same pattern already proven in
 * BookingPaymentService.lockTransactionForUpdate) so a second
 * concurrent call for the same staff blocks until the first commits
 * its PROCESSING row -- at which point the second call's own
 * pendingAmount read correctly includes it. Deliberately does NOT
 * make any external Paystack call while holding this lock (recipient
 * creation and transfer initiation both happen after, once released)
 * -- holding a DB row lock across a slow HTTP round-trip would queue
 * up every other request for this staff behind it, and worse, hold
 * it even longer on a Paystack timeout.
 */
    async requestWithdrawal(staffId: string, amount: number) {
        const settings = await this.prisma.payrollSettings.findFirst();
        if (!settings?.releaseActive) {
            throw new ForbiddenException('Salary withdrawals are currently locked — Payday has not been switched on yet');
        }

        if (amount <= 0) throw new BadRequestException('Withdrawal amount must be greater than zero');

        const bankAccount = await this.prisma.staffBankAccount.findUnique({ where: { staffId } });
        if (!bankAccount) {
            throw new BadRequestException('No bank account on file — add one before requesting a withdrawal');
        }

        const transferReference = `staff-payout-${randomBytes(8).toString('hex')}`;

        const payoutRequest = await this.prisma.$transaction(async (tx) => {
            // Locks this staff member's wallet row for the rest of this
            // transaction -- any other concurrent requestWithdrawal call
            // for the SAME staffId blocks here until this transaction
            // commits or rolls back. Different staff members never
            // contend with each other, since each locks only their own
            // row. Reading balance from THIS query's result (rather than
            // a separate tx.staffWallet.findUnique before it) matters --
            // a plain SELECT before the lock could still return a value
            // that's stale by the time the lock is actually acquired.
            const locked = await tx.$queryRaw(
                Prisma.sql`SELECT id, balance FROM staff_wallets WHERE staff_id = ${staffId} FOR UPDATE`,
            ) as { id: string; balance: Prisma.Decimal }[];
            if (!locked.length) throw new BadRequestException('Wallet not found');
            const walletBalance = Number(locked[0].balance);

            const pendingAgg = await tx.staffPayoutRequest.aggregate({
                where: { staffId, status: { in: ['PENDING', 'PROCESSING'] } },
                _sum: { amount: true },
            });
            const pendingAmount = Number(pendingAgg._sum.amount ?? 0);
            const availableBalance = walletBalance - pendingAmount;

            if (amount > availableBalance) {
                throw new BadRequestException(`Insufficient available balance. Available: \u20a6${availableBalance.toFixed(2)}`);
            }

            return tx.staffPayoutRequest.create({
                data: {
                    staffId,
                    amount,
                    bankCode: bankAccount.bankCode,
                    accountNumber: bankAccount.accountNumber,
                    accountName: bankAccount.accountName,
                    status: 'PROCESSING',
                    paystackTransferReference: transferReference,
                },
            });
        });

        // The reservation above is now committed and visible to any other
        // concurrent request's pendingAmount read -- everything from here
        // is a normal, unlocked external call.
        try {
            const recipient = await this.paystackService.createTransferRecipient({
                name: bankAccount.accountName,
                accountNumber: bankAccount.accountNumber,
                bankCode: bankAccount.bankCode,
            });

            const transfer = await this.paystackService.initiateTransfer({
                amount,
                recipientCode: recipient.recipient_code,
                reference: transferReference,
                reason: `Hairlux staff salary withdrawal ${payoutRequest.id}`,
            });

            return this.handleTransferOutcome(payoutRequest.id, transferReference, transfer);
        } catch (error) {
            await this.prisma.staffPayoutRequest.update({
                where: { id: payoutRequest.id },
                data: { status: 'FAILED', rejectionReason: error instanceof Error ? error.message : 'Transfer initiation failed' },
            });
            this.logger.error(`Staff payout failed for ${payoutRequest.id}: ${error instanceof Error ? error.message : String(error)}`);
            throw new BadRequestException('Unable to initiate withdrawal transfer. Please try again later.');
        }
    }

    private async handleTransferOutcome(payoutRequestId: string, transferReference: string, transfer: { transfer_code: string; status: string }) {
        await this.prisma.staffPayoutRequest.update({
            where: { id: payoutRequestId },
            data: { paystackTransferCode: transfer.transfer_code },
        });

        if (this.paystackService.isTransferFailureStatus(transfer.status)) {
            const updated = await this.prisma.staffPayoutRequest.update({
                where: { id: payoutRequestId },
                data: { status: 'FAILED', rejectionReason: `Paystack transfer ${transfer.status}` },
            });
            // System-driven outcome, no human actor -- actorId deliberately omitted.
            await this.payrollAuditService.log({
                action: 'WITHDRAWAL_FAILED',
                entityType: 'StaffPayoutRequest',
                entityId: payoutRequestId,
                staffId: updated.staffId,
                note: `Paystack transfer ${transfer.status}`,
                after: { status: 'FAILED', amount: updated.amount },
            });
            throw new BadRequestException('Paystack rejected the withdrawal transfer. Please try again later.');
        }

        if (this.paystackService.isTransferSuccessStatus(transfer.status)) {
            return this.completeTransfer(payoutRequestId, transferReference);
        }

        // Some transfers need a follow-up OTP finalize step before they settle.
        return this.prisma.staffPayoutRequest.findUnique({ where: { id: payoutRequestId } });
    }

    /**
     * Only place a wallet debit actually happens — inside a transaction,
     * re-checking balance sufficiency at the moment of completion.
     */
    private async completeTransfer(payoutRequestId: string, reference: string) {
        const result = await this.prisma.$transaction(async (tx) => {
            const request = await tx.staffPayoutRequest.findUnique({ where: { id: payoutRequestId } });
            if (!request || request.status === 'COMPLETED') return { updated: request, alreadyCompleted: true };

            const wallet = await tx.staffWallet.findUnique({ where: { staffId: request.staffId } });
            if (!wallet) throw new BadRequestException('Wallet not found at withdrawal completion');
            if (Number(wallet.balance) < Number(request.amount)) {
                throw new BadRequestException('Insufficient wallet balance at withdrawal completion');
            }

            await tx.staffWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: request.amount } } });

            const transaction = await tx.staffWalletTransaction.create({
                data: {
                    walletId: wallet.id,
                    type: 'WITHDRAWAL',
                    amount: request.amount,
                    status: 'COMPLETED',
                    reference: `WITHDRAWAL-${request.id}`,
                    description: `Withdrawal via Paystack transfer ${reference}`,
                },
            });

            const updated = await tx.staffPayoutRequest.update({
                where: { id: request.id },
                data: { status: 'COMPLETED', processedAt: new Date(), transactionId: transaction.id },
            });
            return { updated, alreadyCompleted: false };
        });

        // Logged after commit, and only for a genuine first-time
        // completion -- not the idempotent short-circuit above, which
        // would otherwise duplicate the log entry for the same event.
        if (!result.alreadyCompleted && result.updated) {
            await this.payrollAuditService.log({
                action: 'WITHDRAWAL_COMPLETED',
                entityType: 'StaffPayoutRequest',
                entityId: payoutRequestId,
                staffId: result.updated.staffId,
                note: `Paystack transfer ${reference}`,
                after: { status: 'COMPLETED', amount: result.updated.amount },
            });
        }

        return result.updated;
    }

    /**
 * Paystack transfer webhook settlement — the gap this closes: a
 * transfer's SYNCHRONOUS response (success/pending/otp) isn't the
 * authoritative outcome (Paystack's own docs say the webhook is);
 * requestWithdrawal only ever acted on that synchronous response, so
 * any transfer that came back pending/otp instead of an immediate
 * success sat in PROCESSING forever with no path to ever resolve.
 * Looked up by reference (webhooks carry the reference, not our own
 * id) -- called from PaystackTransferWebhookProcessor, which tries
 * the Beautician payout table first and falls back to this one, since
 * both systems currently share one webhook endpoint/queue.
 */
    async completeTransferByReference(reference: string) {
        const request = await this.prisma.staffPayoutRequest.findUnique({ where: { paystackTransferReference: reference } });
        if (!request) return null;
        return this.completeTransfer(request.id, reference);
    }

    /** Counterpart to completeTransferByReference for transfer.failed / transfer.reversed webhook events. */
    async failTransferByReference(reference: string, reason: string) {
        const request = await this.prisma.staffPayoutRequest.findUnique({ where: { paystackTransferReference: reference } });
        if (!request) return null;
        // A transfer that already completed (or was already marked failed
        // by an earlier delivery of the same webhook -- Paystack retries
        // on a non-2xx response) is left alone rather than re-failing a
        // request that's already settled one way or the other.
        if (request.status === 'COMPLETED' || request.status === 'FAILED') return request;

        const updated = await this.prisma.staffPayoutRequest.update({
            where: { id: request.id },
            data: { status: 'FAILED', rejectionReason: reason },
        });
        await this.payrollAuditService.log({
            action: 'WITHDRAWAL_FAILED',
            entityType: 'StaffPayoutRequest',
            entityId: request.id,
            staffId: updated.staffId,
            note: reason,
            after: { status: 'FAILED', amount: updated.amount },
        });
        return updated;
    }

    /**
     * Admin manual reconciliation fallback -- for a request stuck in
     * PROCESSING despite the webhook fix above (e.g. Paystack's webhook
     * delivery itself failed all 3 retries, or this predates the fix).
     * Queries Paystack directly for the transfer's actual current status
     * rather than trusting anything already stored locally, then routes
     * through the exact same completion/failure paths a webhook would.
     */
    async adminResyncWithdrawal(payoutRequestId: string) {
        const request = await this.prisma.staffPayoutRequest.findUnique({ where: { id: payoutRequestId } });
        if (!request) throw new NotFoundException('Withdrawal request not found');
        if (!request.paystackTransferCode || !request.paystackTransferReference) {
            throw new BadRequestException('This request has no Paystack transfer reference yet — it may have failed before a transfer was ever created');
        }
        if (request.status === 'COMPLETED' || request.status === 'FAILED') {
            return request;
        }
        const reference = request.paystackTransferReference;

        const status = await this.paystackService.getTransferStatus(request.paystackTransferCode);

        if (this.paystackService.isTransferSuccessStatus(status)) {
            return this.completeTransfer(request.id, reference);
        }
        if (this.paystackService.isTransferFailureStatus(status)) {
            return this.failTransferByReference(reference, `Paystack transfer ${status} (resynced by admin)`);
        }
        // Still genuinely pending at Paystack's end -- nothing to update yet.
        return request;
    }

    /**
 * Dev Feedback Round 9: Paystack's "Transfer Approvals" dashboard
 * setting requires an Approval URL that programmatically approves or
 * rejects each transfer before Paystack sends it -- without one
 * configured, every transfer sits pending manual approval in
 * Paystack's own dashboard, which is what "the withdrawal got
 * blocked" was. Paystack only supports ONE Approval URL per mode, so
 * this is called from the SAME shared controller endpoint the
 * Beautician payout system already owns (PaystackTransferWebhookController),
 * routed there by reference prefix -- kept here, in Staff Payout's own
 * service, rather than in that shared file or (worse) inside
 * Beautician's own PaystackTransferApprovalService, so Staff Payout's
 * approval rules are entirely self-contained. Mirrors that service's
 * own validation shape (reference + amount-in-kobo match, correct
 * status) against staffPayoutRequest instead of the Beautician
 * payoutRequest table.
 */
    async validateTransferApproval(payload: { reference?: string; amount?: number; data?: { reference?: string; amount?: number } }): Promise<boolean> {
        const reference = payload.reference ?? payload.data?.reference;
        const amountKobo = payload.amount ?? payload.data?.amount;

        if (!reference || amountKobo == null) {
            this.logger.warn('Paystack transfer approval missing reference or amount');
            return false;
        }

        const payoutRequest = await this.prisma.staffPayoutRequest.findUnique({
            where: { paystackTransferReference: reference },
        });

        if (!payoutRequest) {
            this.logger.warn(`Paystack transfer approval rejected: unknown staff payout reference ${reference}`);
            return false;
        }

        if (payoutRequest.status !== 'PROCESSING' && payoutRequest.status !== 'PENDING') {
            this.logger.warn(`Paystack transfer approval rejected: staff payout ${payoutRequest.id} is ${payoutRequest.status}`);
            return false;
        }

        const expectedAmountKobo = Math.round(Number(payoutRequest.amount) * 100);
        if (expectedAmountKobo !== amountKobo) {
            this.logger.warn(`Paystack transfer approval rejected: amount mismatch for ${reference} (expected ${expectedAmountKobo}, got ${amountKobo})`);
            return false;
        }

        this.logger.log(`Paystack transfer approval accepted: ${reference}`);
        return true;
    }

    async listMyWithdrawals(staffId: string) {
        return this.prisma.staffPayoutRequest.findMany({
            where: { staffId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getMyWallet(staffId: string) {
        const wallet = await this.prisma.staffWallet.findUnique({ where: { staffId } });
        const settings = await this.prisma.payrollSettings.findFirst();
        const releaseActive = !!settings?.releaseActive;

        if (!wallet) return { balance: 0, releaseActive };

        const pendingAgg = await this.prisma.staffPayoutRequest.aggregate({
            where: { staffId, status: { in: ['PENDING', 'PROCESSING'] } },
            _sum: { amount: true },
        });
        const pendingAmount = Number(pendingAgg._sum.amount ?? 0);

        return {
            balance: Number(wallet.balance),
            pendingWithdrawals: pendingAmount,
            availableBalance: Number(wallet.balance) - pendingAmount,
            releaseActive,
        };
    }

    // -- Admin views --------------------------------------------------------

    /**
     * Dev Feedback Round 4, items #22-24: "fully filterable" -- status
     * alone previously. Adds staffId, branch (via the staff relation,
     * same pattern as leave.service.ts's own locationId filter),
     * createdAt date range (not processedAt -- a still-pending request
     * has no processedAt yet, and would silently drop out of any
     * processedAt-based range filter), and real pagination, since this
     * had none at all before.
     */
    async adminListWithdrawals(filters: { status?: string; staffId?: string; locationId?: string; from?: string; to?: string; page?: number; limit?: number }) {
        const page = filters.page ?? 1;
        const limit = filters.limit ?? 50;
        const where: any = {
            ...(filters.status && { status: filters.status }),
            ...(filters.staffId && { staffId: filters.staffId }),
            ...(filters.locationId && { staff: { locationId: filters.locationId } }),
            ...((filters.from || filters.to) && {
                createdAt: {
                    ...(filters.from && { gte: new Date(filters.from) }),
                    ...(filters.to && { lte: new Date(filters.to) }),
                },
            }),
        };

        const [data, total] = await Promise.all([
            this.prisma.staffPayoutRequest.findMany({
                where,
                include: { staff: { select: { id: true, name: true, staffCode: true, location: { select: { id: true, name: true } } } } },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            this.prisma.staffPayoutRequest.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async adminDashboardStats() {
        const [totalWalletBalance, pendingAgg, completedAgg, failedCount] = await Promise.all([
            this.prisma.staffWallet.aggregate({ _sum: { balance: true } }),
            this.prisma.staffPayoutRequest.aggregate({ where: { status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { amount: true } }),
            this.prisma.staffPayoutRequest.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
            this.prisma.staffPayoutRequest.count({ where: { status: 'FAILED' } }),
        ]);

        return {
            outstandingWalletBalance: Number(totalWalletBalance._sum.balance ?? 0),
            pendingWithdrawals: Number(pendingAgg._sum.amount ?? 0),
            totalWithdrawn: Number(completedAgg._sum.amount ?? 0),
            failedWithdrawals: failedCount,
        };
    }
}