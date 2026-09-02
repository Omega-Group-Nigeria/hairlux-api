import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { PayoutRequestStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayoutTransferSettlementService } from '../services/payout-transfer-settlement.service';
import { StaffPayoutService } from '../../../payroll/staff-payout.service';

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
    private readonly staffPayoutService: StaffPayoutService,
  ) { }

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
      // Dev Feedback Round 9: this used to stop here and log
      // "no payout request for reference" for ANY unmatched reference,
      // silently dropping every Staff Payout transfer webhook -- Staff
      // Payout has its own reference series (STAFF-PAYOUT-...) in a
      // separate table this query never checked. Both payout systems
      // currently share this one webhook endpoint/queue, so falling back
      // here is the fix rather than standing up a second endpoint.
      return this.handleStaffPayoutWebhook(event, reference);
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

  private async handleStaffPayoutWebhook(event: string, reference: string) {
    if (event === 'transfer.success') {
      const result = await this.staffPayoutService.completeTransferByReference(reference);
      if (!result) {
        this.logger.warn(`No payout request (beautician or staff) for transfer reference ${reference}`);
        return { status: 'not_found', reference };
      }
      return { status: 'success', reference };
    }

    if (event === 'transfer.failed' || event === 'transfer.reversed') {
      const result = await this.staffPayoutService.failTransferByReference(reference, `Paystack ${event}`);
      if (!result) {
        this.logger.warn(`No payout request (beautician or staff) for transfer reference ${reference}`);
        return { status: 'not_found', reference };
      }
      return { status: 'rejected', reference, event };
    }

    this.logger.log(`Ignoring transfer webhook event: ${event}`);
    return { status: 'ignored', event };
  }
}