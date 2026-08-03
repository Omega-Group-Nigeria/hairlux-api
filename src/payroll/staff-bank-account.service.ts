import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { SubmitBankAccountDto } from './dto/submit-bank-account.dto';
import { accountNameMatchesProfile } from './utils/account-name-match.util';

@Injectable()
export class StaffBankAccountService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly paystackService: PaystackService,
    ) { }

    /**
     * Resolve-only, no save — lets the frontend show the account holder's
     * real name as a live preview before the staff member commits to
     * saving, matching the standard "type account number, see the name
     * appear" pattern most Nigerian fintech apps use. Also flags whether
     * the resolved name actually matches the staff member's own name, so
     * the frontend can warn before they even attempt to submit.
     */
    async resolveAccount(staffId: string, bankCode: string, accountNumber: string) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const resolved = await this.paystackService.resolveAccountNumber(accountNumber, bankCode);
        const banks = await this.paystackService.listBanks();
        const bank = banks.find((b) => b.code === bankCode);
        const nameMatches = accountNameMatchesProfile(resolved.account_name, staff.name);
        return { accountName: resolved.account_name, bankName: bank?.name ?? bankCode, nameMatches };
    }

    /**
     * First-time setup goes straight through (nothing to protect yet).
     * If an account already exists, this instead stages the change in the
     * pending* fields and requires admin approval before it takes effect —
     * per the "not editable without admin consent" requirement. Either way,
     * Paystack's own account resolution confirms the account is real and
     * returns its true registered name before anything is saved — and the
     * resolved name must actually match the staff member's own name, or
     * the request is rejected outright. This mirrors the same hard block
     * already proven in the Beautician payout flow, since an unrelated
     * account on file is exactly the kind of thing that shouldn't be
     * possible to save quietly, whatever the reason behind it.
     */
    async submitBankAccount(staffId: string, dto: SubmitBankAccountDto) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { name: true } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const resolved = await this.paystackService.resolveAccountNumber(dto.accountNumber, dto.bankCode);
        if (!accountNameMatchesProfile(resolved.account_name, staff.name)) {
            throw new BadRequestException('This account is not registered in your name. Salary can only be paid into an account that matches your name on file — contact an admin if you believe this is an error.');
        }

        const banks = await this.paystackService.listBanks();
        const bank = banks.find((b) => b.code === dto.bankCode);
        const bankName = bank?.name ?? dto.bankCode;

        const existing = await this.prisma.staffBankAccount.findUnique({ where: { staffId } });

        if (!existing) {
            return this.prisma.staffBankAccount.create({
                data: {
                    staffId,
                    bankCode: dto.bankCode,
                    bankName,
                    accountNumber: dto.accountNumber,
                    accountName: resolved.account_name,
                    verified: true,
                    verifiedAt: new Date(),
                },
            });
        }

        return this.prisma.staffBankAccount.update({
            where: { staffId },
            data: {
                pendingBankCode: dto.bankCode,
                pendingBankName: bankName,
                pendingAccountNumber: dto.accountNumber,
                pendingAccountName: resolved.account_name,
                pendingRequestedAt: new Date(),
            },
        });
    }

    async listBanks() {
        return this.paystackService.listBanks();
    }

    async getBankAccount(staffId: string) {
        return this.prisma.staffBankAccount.findUnique({ where: { staffId } });
    }

    async listPendingChanges() {
        return this.prisma.staffBankAccount.findMany({
            where: { pendingRequestedAt: { not: null } },
            include: { staff: { select: { id: true, name: true, staffCode: true } } },
        });
    }

    /**
     * Admin sign-off on a pending change. The account itself was already
     * verified via Paystack at submission time (that's where
     * pendingAccountName came from) — this step is purely the "not
     * editable without admin consent" gate, not a re-verification.
     */
    async approveChange(staffId: string) {
        const account = await this.prisma.staffBankAccount.findUnique({ where: { staffId } });
        if (!account) throw new NotFoundException('Bank account not found');
        if (!account.pendingRequestedAt) throw new BadRequestException('No pending change to approve');

        return this.prisma.staffBankAccount.update({
            where: { staffId },
            data: {
                bankCode: account.pendingBankCode!,
                bankName: account.pendingBankName!,
                accountNumber: account.pendingAccountNumber!,
                accountName: account.pendingAccountName!,
                verified: true,
                verifiedAt: new Date(),
                pendingBankCode: null,
                pendingBankName: null,
                pendingAccountNumber: null,
                pendingAccountName: null,
                pendingRequestedAt: null,
            },
        });
    }

    async rejectChange(staffId: string) {
        const account = await this.prisma.staffBankAccount.findUnique({ where: { staffId } });
        if (!account) throw new NotFoundException('Bank account not found');

        return this.prisma.staffBankAccount.update({
            where: { staffId },
            data: {
                pendingBankCode: null,
                pendingBankName: null,
                pendingAccountNumber: null,
                pendingAccountName: null,
                pendingRequestedAt: null,
            },
        });
    }
}