import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';

@Injectable()
export class StaffPayoutService {
    private readonly logger = new Logger(StaffPayoutService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly paystackService: PaystackService,
    ) { }

    /**
     * Self-service withdrawal — once the global Payday switch is on, staff
     * can withdraw all or part of their wallet balance, as many times as
     * they like until it reaches zero. The debit only happens on confirmed
     * Paystack success (see completeTransfer) so a failed transfer never
     * needs a manual balance correction — nothing was taken in the first
     * place.
     */
    async requestWithdrawal(staffId: string, amount: number) {
        const settings = await this.prisma.payrollSettings.findFirst();
        if (!settings?.releaseActive) {
            throw new ForbiddenException('Salary withdrawals are currently locked — Payday has not been switched on yet');
        }

        if (amount <= 0) throw new BadRequestException('Withdrawal amount must be greater than zero');

        const wallet = await this.prisma.staffWallet.findUnique({ where: { staffId } });
        if (!wallet) throw new BadRequestException('Wallet not found');

        const pendingAgg = await this.prisma.staffPayoutRequest.aggregate({
            where: { staffId, status: { in: ['PENDING', 'PROCESSING'] } },
            _sum: { amount: true },
        });
        const pendingAmount = Number(pendingAgg._sum.amount ?? 0);
        const availableBalance = Number(wallet.balance) - pendingAmount;

        if (amount > availableBalance) {
            throw new BadRequestException(`Insufficient available balance. Available: \u20a6${availableBalance.toFixed(2)}`);
        }

        const bankAccount = await this.prisma.staffBankAccount.findUnique({ where: { staffId } });
        if (!bankAccount) {
            throw new BadRequestException('No bank account on file — add one before requesting a withdrawal');
        }

        const recipient = await this.paystackService.createTransferRecipient({
            name: bankAccount.accountName,
            accountNumber: bankAccount.accountNumber,
            bankCode: bankAccount.bankCode,
        });

        const transferReference = `STAFF-PAYOUT-${randomBytes(8).toString('hex')}`;

        const payoutRequest = await this.prisma.staffPayoutRequest.create({
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

        try {
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
            await this.prisma.staffPayoutRequest.update({
                where: { id: payoutRequestId },
                data: { status: 'FAILED', rejectionReason: `Paystack transfer ${transfer.status}` },
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
        return this.prisma.$transaction(async (tx) => {
            const request = await tx.staffPayoutRequest.findUnique({ where: { id: payoutRequestId } });
            if (!request || request.status === 'COMPLETED') return request;

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

            return tx.staffPayoutRequest.update({
                where: { id: request.id },
                data: { status: 'COMPLETED', processedAt: new Date(), transactionId: transaction.id },
            });
        });
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

    async adminListWithdrawals(status?: string) {
        return this.prisma.staffPayoutRequest.findMany({
            where: status ? { status: status as any } : undefined,
            include: { staff: { select: { id: true, name: true, staffCode: true } } },
            orderBy: { createdAt: 'desc' },
        });
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