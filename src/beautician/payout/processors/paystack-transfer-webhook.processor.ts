import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayoutTransferSettlementService } from '../services/payout-transfer-settlement.service';

interface TransferWebhookJobData {
  event: string;
  data: {
    reference: string;
    status?: string;
    amount?: number;
    transfer_code?: string;
  };
}

@Processor('paystack-transfer-webhooks')
export class PaystackTransferWebhookProcessor {
  private readonly logger = new Logger(PaystackTransferWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlementService: PayoutTransferSettlementService,
  ) {}

  @Process('transfer-webhook')
  async handleTransferWebhook(job: Job<TransferWebhookJobData>) {
    const { event, data } = job.data;
    const reference = data.reference;

    if (!reference) {
      this.logger.warn(`Transfer webhook missing reference for event ${event}`);
      return { status: 'ignored', reason: 'missing_reference' };
    }

    const payoutRequest = await this.prisma.payoutRequest.findUnique({
      where: { paystackTransferReference: reference },
    });

    if (!payoutRequest) {
      this.logger.warn(`No payout request for transfer reference ${reference}`);
      return { status: 'not_found', reference };
    }

    if (payoutRequest.status === PayoutRequestStatus.COMPLETED) {
      return { status: 'already_processed', reference };
    }

    if (event === 'transfer.success') {
      return this.settlementService.completeTransfer(payoutRequest, reference, {
        processedById: payoutRequest.processedById ?? undefined,
      });
    }

    if (event === 'transfer.failed' || event === 'transfer.reversed') {
      await this.settlementService.rejectTransfer(
        payoutRequest.id,
        reference,
        `Paystack ${event}`,
      );

      return { status: 'rejected', reference, event };
    }

    this.logger.log(`Ignoring transfer webhook event: ${event}`);
    return { status: 'ignored', event };
  }
}