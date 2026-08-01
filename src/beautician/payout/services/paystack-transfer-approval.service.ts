import { Injectable, Logger } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

interface PaystackTransferApprovalPayload {
  reference?: string;
  amount?: number;
  recipient?: string;
  source?: string;
  reason?: string;
  data?: {
    reference?: string;
    amount?: number;
    recipient?: string;
  };
}

@Injectable()
export class PaystackTransferApprovalService {
  private readonly logger = new Logger(PaystackTransferApprovalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async validateTransferApproval(
    payload: PaystackTransferApprovalPayload,
  ): Promise<boolean> {
    const reference = payload.reference ?? payload.data?.reference;
    const amountKobo = payload.amount ?? payload.data?.amount;

    if (!reference || amountKobo == null) {
      this.logger.warn('Paystack transfer approval missing reference or amount');
      return false;
    }

    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { paystackTransferReference: reference },
    });

    if (!payoutRequest) {
      this.logger.warn(
        `Paystack transfer approval rejected: unknown reference ${reference}`,
      );
      return false;
    }

    if (
      payoutRequest.status !== PayoutRequestStatus.PROCESSING &&
      payoutRequest.status !== PayoutRequestStatus.PENDING
    ) {
      this.logger.warn(
        `Paystack transfer approval rejected: payout ${payoutRequest.id} is ${payoutRequest.status}`,
      );
      return false;
    }

    const expectedAmountKobo = Math.round(Number(payoutRequest.amount) * 100);
    if (expectedAmountKobo !== amountKobo) {
      this.logger.warn(
        `Paystack transfer approval rejected: amount mismatch for ${reference} (expected ${expectedAmountKobo}, got ${amountKobo})`,
      );
      return false;
    }

    this.logger.log(`Paystack transfer approval accepted: ${reference}`);
    return true;
  }
}