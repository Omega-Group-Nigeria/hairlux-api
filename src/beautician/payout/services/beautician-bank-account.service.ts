import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../payment/paystack.service';
import { accountNameMatchesProfile } from '../utils/account-name-match.util';

@Injectable()
export class BeauticianBankAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
  ) {}

  async setupBankAccount(
    userId: string,
    input: { bankCode: string; accountNumber: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        beauticianProfile: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!user || user.role !== UserRole.BEAUTICIAN) {
      throw new ForbiddenException('Only beauticians can set up payout accounts');
    }

    if (!user.beauticianProfile) {
      throw new NotFoundException('Beautician profile not found');
    }

    if (!user.beauticianProfile.isActive) {
      throw new ForbiddenException(
        'Your beautician account is suspended and cannot update payout details',
      );
    }

    const bankCode = input.bankCode.trim();
    const accountNumber = input.accountNumber.trim();

    const resolved = await this.paystackService.resolveAccountNumber(
      accountNumber,
      bankCode,
    );

    if (
      !accountNameMatchesProfile(
        resolved.account_name,
        user.firstName,
        user.lastName,
      )
    ) {
      throw new BadRequestException(
        'Bank account name does not match your profile name. Use an account registered in your name.',
      );
    }

    const recipient = await this.paystackService.createTransferRecipient({
      name: resolved.account_name,
      accountNumber,
      bankCode,
    });

    const verifiedAt = new Date();
    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        payoutBankCode: bankCode,
        payoutAccountNumber: accountNumber,
        payoutAccountName: resolved.account_name,
        paystackRecipientCode: recipient.recipient_code,
        payoutBankVerifiedAt: verifiedAt,
      },
      select: {
        payoutBankCode: true,
        payoutAccountNumber: true,
        payoutAccountName: true,
        paystackRecipientCode: true,
        payoutBankVerifiedAt: true,
      },
    });

    return {
      bankCode: updated.payoutBankCode,
      accountNumber: this.maskAccountNumber(updated.payoutAccountNumber!),
      accountName: updated.payoutAccountName,
      recipientCode: updated.paystackRecipientCode,
      verifiedAt: updated.payoutBankVerifiedAt,
    };
  }

  async getBankAccount(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        payoutBankCode: true,
        payoutAccountNumber: true,
        payoutAccountName: true,
        paystackRecipientCode: true,
        payoutBankVerifiedAt: true,
      },
    });

    if (!profile?.paystackRecipientCode) {
      return { configured: false };
    }

    return {
      configured: true,
      bankCode: profile.payoutBankCode,
      accountNumber: this.maskAccountNumber(profile.payoutAccountNumber!),
      accountName: profile.payoutAccountName,
      verifiedAt: profile.payoutBankVerifiedAt,
    };
  }

  async getPayoutDestination(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        payoutBankCode: true,
        payoutAccountNumber: true,
        payoutAccountName: true,
        paystackRecipientCode: true,
      },
    });

    if (
      !profile?.paystackRecipientCode ||
      !profile.payoutBankCode ||
      !profile.payoutAccountNumber
    ) {
      throw new BadRequestException(
        'Set up your payout bank account before requesting a withdrawal',
      );
    }

    return {
      bankCode: profile.payoutBankCode,
      accountNumber: profile.payoutAccountNumber,
      accountName: profile.payoutAccountName,
      recipientCode: profile.paystackRecipientCode,
    };
  }

  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return `${'*'.repeat(accountNumber.length - 4)}${accountNumber.slice(-4)}`;
  }
}