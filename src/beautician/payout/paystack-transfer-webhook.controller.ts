import { InjectQueue } from '@nestjs/bull';
import type { RawBodyRequest } from '@nestjs/common';
import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bull';
import type { Request, Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { PaystackService } from '../../payment/paystack.service';
import { StaffPayoutService } from '../../payroll/staff-payout.service';
import { PaystackTransferApprovalService } from './services/paystack-transfer-approval.service';

@ApiTags('Webhooks')
@Controller('webhooks/paystack')
export class PaystackTransferWebhookController {
  private readonly logger = new Logger(PaystackTransferWebhookController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly transferApprovalService: PaystackTransferApprovalService,
    private readonly staffPayoutService: StaffPayoutService,
    @InjectQueue('paystack-transfer-webhooks')
    private readonly transferWebhookQueue: Queue,
    // Dev Feedback Round 9: same underlying Redis-backed queue already
    // registered in WalletModule -- injectable here too, for the
    // symmetric charge.* forwarding above.
    @InjectQueue('paystack-webhooks')
    private readonly depositWebhookQueue: Queue,
  ) { }

  @Public()
  @Post('transfer/approval')
  @SkipThrottle()
  @ApiExcludeEndpoint()
  async handleTransferApproval(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody?.toString('utf-8') || JSON.stringify(req.body ?? {});

    if (
      signature &&
      !this.paystackService.verifyWebhookSignature(rawBody, signature)
    ) {
      this.logger.warn('Invalid Paystack transfer approval signature');
      return res.status(HttpStatus.BAD_REQUEST).json({});
    }

    const body = req.body as {
      reference?: string;
      data?: {
        reference?: string;
        transfers?: { reference?: string }[];
        details?: { body?: { reference?: string } };
      };
    };
    // Dev Feedback Round 9: confirmed against a real, logged approval
    // payload that neither body.reference nor body.data.reference exist
    // -- the reference is nested three levels deep, at either
    // data.details.body.reference (the original /transfer request, as
    // echoed back) or data.transfers[0].reference (the transfer object
    // itself). Same fix applied to StaffPayoutService.validateTransferApproval's
    // own extraction. Before this fix, reference always came back
    // undefined here, so EVERY approval request -- staff or beautician --
    // silently fell through to the Beautician validator by default,
    // which is why a staff-payout-... reference was showing up in that
    // service's own "missing reference" warning.
    const reference = body.reference ?? body.data?.reference ?? body.data?.transfers?.[0]?.reference ?? body.data?.details?.body?.reference;

    // Dev Feedback Round 9: Paystack only supports ONE Transfer Approval

    const approved = reference?.startsWith('staff-payout-')
      ? await this.staffPayoutService.validateTransferApproval(req.body)
      : await this.transferApprovalService.validateTransferApproval(req.body);

    if (!approved) {
      return res.status(HttpStatus.BAD_REQUEST).json({});
    }

    return res.status(HttpStatus.OK).json({});
  }

  @Public()
  @Post('transfer')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleTransferWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    const rawBody =
      req.rawBody?.toString('utf-8') || JSON.stringify(req.body ?? {});

    if (
      !signature ||
      !this.paystackService.verifyWebhookSignature(rawBody, signature)
    ) {
      this.logger.warn(
        `Invalid Paystack transfer signature (rawLength=${rawBody.length})`,
      );
      return { status: 'invalid_signature' };
    }

    const body = req.body as { event?: string; data?: Record<string, unknown> };
    const event = body?.event ?? '';

    // Dev Feedback Round 9: symmetric to the same fix on the deposit
    // webhook endpoint (WalletController.handleWebhook) -- Paystack only
    // supports ONE general Webhook URL per mode, so whichever single URL
    // ends up registered on the dashboard needs to correctly route BOTH
    // event families rather than silently dropping whichever one it
    // wasn't originally built for.
    if (event.startsWith('charge.')) {
      try {
        await this.depositWebhookQueue.add('deposit-webhook', body, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        });
        return { status: 'queued' };
      } catch (error) {
        this.logger.error(
          'Failed to queue Paystack deposit webhook (forwarded from the transfer endpoint)',
          error instanceof Error ? error.stack : String(error),
        );
        return { status: 'queued_with_error' };
      }
    }

    if (!event.startsWith('transfer.')) {
      return { status: 'ignored', event };
    }

    try {
      await this.transferWebhookQueue.add('transfer-webhook', body, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      return { status: 'queued' };
    } catch (error) {
      this.logger.error(
        'Failed to queue Paystack transfer webhook',
        error instanceof Error ? error.stack : String(error),
      );
      return { status: 'queued_with_error' };
    }
  }
}