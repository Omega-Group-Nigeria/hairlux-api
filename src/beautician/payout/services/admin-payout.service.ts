import { Injectable } from '@nestjs/common';
import { PayoutRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminQueryPayoutsDto } from '../dto/admin-query-payouts.dto';
import { BeauticianBankAccountService } from './beautician-bank-account.service';
import { DailyPayoutLimitService } from './daily-payout-limit.service';
import { PaystackPayoutTransferService } from './paystack-payout-transfer.service';

type AdminPayoutListItem = {
  id: string;
  amount: number;
  status: PayoutRequestStatus;
  bankName: string | null;
  accountNumber: string;
  accountName: string | null;
  createdAt: Date;
  beautician: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
};

@Injectable()
export class AdminPayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bankAccountService: BeauticianBankAccountService,
    private readonly paystackPayoutTransferService: PaystackPayoutTransferService,
    private readonly dailyPayoutLimitService: DailyPayoutLimitService,
  ) {}

  async getDailyPayoutPoolStatus() {
    return this.dailyPayoutLimitService.getPoolStatus();
  }

  async processPayout(payoutRequestId: string, adminUserId: string) {
    return this.paystackPayoutTransferService.processPendingRequest(
      payoutRequestId,
      adminUserId,
    );
  }

  async approveTransfer(
    payoutRequestId: string,
    adminUserId: string,
    otp?: string,
  ) {
    return this.paystackPayoutTransferService.approveTransfer(
      payoutRequestId,
      adminUserId,
      otp,
    );
  }

  async listAwaitingApproval() {
    const requests =
      await this.paystackPayoutTransferService.listAwaitingApproval();
    const bankNames = await this.bankAccountService.resolveBankNamesByCode(
      requests.map((request) => request.bankCode),
    );

    return requests.map(({ bankCode, ...request }) => ({
      ...request,
      bankName: bankNames.get(bankCode) ?? null,
    }));
  }

  async listPayouts(query: AdminQueryPayoutsDto): Promise<AdminPayoutListItem[]> {
    const { status } = query;
    const where: Prisma.PayoutRequestWhereInput = status ? { status } : {};

    const requests = await this.prisma.payoutRequest.findMany({
      where,
      orderBy: {
        createdAt: status === PayoutRequestStatus.PENDING ? 'asc' : 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    const bankNames = await this.bankAccountService.resolveBankNamesByCode(
      requests.map((request) => request.bankCode),
    );

    return requests.map((request) =>
      this.formatPayoutRequest(request, bankNames),
    );
  }

  private formatPayoutRequest(
    request: {
      id: string;
      amount: Prisma.Decimal;
      status: PayoutRequestStatus;
      bankCode: string;
      accountNumber: string;
      accountName: string | null;
      createdAt: Date;
      user: AdminPayoutListItem['beautician'];
    },
    bankNames: Map<string, string>,
  ): AdminPayoutListItem {
    return {
      id: request.id,
      amount: Number(request.amount),
      status: request.status,
      bankName: bankNames.get(request.bankCode) ?? null,
      accountNumber: request.accountNumber,
      accountName: request.accountName,
      createdAt: request.createdAt,
      beautician: request.user,
    };
  }

}