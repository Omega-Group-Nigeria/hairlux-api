import { Injectable } from '@nestjs/common';
import { BeauticianBankAccountService } from './beautician-bank-account.service';
import { PaystackPayoutTransferService } from './paystack-payout-transfer.service';

@Injectable()
export class AutoPayoutService {
  constructor(
    private readonly bankAccountService: BeauticianBankAccountService,
    private readonly paystackPayoutTransferService: PaystackPayoutTransferService,
  ) {}

  async initiateWithdrawal(userId: string, input: { amount: number }) {
    const destination = await this.bankAccountService.getPayoutDestination(userId);

    const result = await this.paystackPayoutTransferService.initiateForUser(
      userId,
      {
        amount: input.amount,
        bankCode: destination.bankCode,
        accountNumber: destination.accountNumber,
        accountName: destination.accountName,
        recipientCode: destination.recipientCode,
      },
    );

    return {
      id: result.payoutRequestId,
      amount: result.amount,
      status: result.status,
      transferReference: result.transferReference,
      transferCode: result.transferCode,
      requiresApproval: result.requiresApproval,
      requiresOtp: result.requiresOtp,
    };
  }
}