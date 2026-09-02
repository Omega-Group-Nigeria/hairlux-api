import { Injectable, Logger } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

interface PaystackTransferApprovalPayload {
  event?: string;
  reference?: string;
  amount?: number | string;
  data?: {
    reference?: string;
    amount?: number | string;
    recipient?: any;
  };
}

@Injectable()
export class PaystackTransferApprovalService {
  private readonly logger = new Logger(PaystackTransferApprovalService.name);

  constructor(private readonly prisma: PrismaService) { }

  async validateTransferApproval(
    payload: PaystackTransferApprovalPayload,
  ): Promise<boolean> {
    // 1. Extract reference and amount from either root or nested data
    const rawData = payload.data ?? payload;
    const reference = rawData.reference ?? payload.reference;
    const rawAmount = rawData.amount ?? payload.amount;

    const amountKobo = rawAmount != null ? Number(rawAmount) : null;

    if (!reference || amountKobo == null || isNaN(amountKobo)) {
      this.logger.warn(
        `Paystack transfer approval missing reference or amount. Received: ${JSON.stringify(
          payload,
        )}`,
      );
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