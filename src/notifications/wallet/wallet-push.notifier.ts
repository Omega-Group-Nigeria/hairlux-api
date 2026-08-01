import { Injectable, Logger } from '@nestjs/common';
import { PushDispatchService } from '../push/push-dispatch.service';
import { PushMessageFactory } from '../push/push-message.factory';
import { PUSH_EVENTS } from '../push/push-event.types';

export type WalletDepositSuccessInput = {
  userId: string;
  amount: number;
  reference: string;
  newBalance?: number;
};

export type WalletPayoutCompletedInput = {
  userId: string;
  amount: number;
  reference: string;
  payoutRequestId?: string;
};

export type WalletPayoutFailedInput = {
  userId: string;
  amount: number;
  reference: string;
  reason?: string;
  payoutRequestId?: string;
};

/**
 * Wallet-domain push notifications only (SRP).
 * Call after successful credit / payout settlement — never from payment SDK code.
 */
@Injectable()
export class WalletPushNotifier {
  private readonly logger = new Logger(WalletPushNotifier.name);

  constructor(
    private readonly dispatch: PushDispatchService,
    private readonly factory: PushMessageFactory,
  ) {}

  /** After wallet balance is credited (verify or webhook). */
  notifyDepositSuccess(input: WalletDepositSuccessInput): void {
    const amountLabel = this.factory.formatAmount(input.amount);
    void this.dispatch
      .sendEvent(
        input.userId,
        PUSH_EVENTS.WALLET_DEPOSIT_SUCCESS,
        { amount: amountLabel },
        {
          amount: String(input.amount),
          reference: input.reference,
          ...(input.newBalance != null
            ? { newBalance: String(input.newBalance) }
            : {}),
        },
      )
      .catch((err) =>
        this.logger.warn(
          `deposit_success push error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /** After payout transfer settled successfully. */
  notifyPayoutCompleted(input: WalletPayoutCompletedInput): void {
    const amountLabel = this.factory.formatAmount(input.amount);
    void this.dispatch
      .sendEvent(
        input.userId,
        PUSH_EVENTS.WALLET_PAYOUT_COMPLETED,
        { amount: amountLabel },
        {
          amount: String(input.amount),
          reference: input.reference,
          ...(input.payoutRequestId
            ? { payoutRequestId: input.payoutRequestId }
            : {}),
        },
      )
      .catch((err) =>
        this.logger.warn(
          `payout_completed push error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /** After payout transfer rejected / failed. */
  notifyPayoutFailed(input: WalletPayoutFailedInput): void {
    const amountLabel = this.factory.formatAmount(input.amount);
    const reasonSuffix = input.reason?.trim()
      ? ` ${input.reason.trim()}`
      : '';

    void this.dispatch
      .sendEvent(
        input.userId,
        PUSH_EVENTS.WALLET_PAYOUT_FAILED,
        { amount: amountLabel, reasonSuffix },
        {
          amount: String(input.amount),
          reference: input.reference,
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.payoutRequestId
            ? { payoutRequestId: input.payoutRequestId }
            : {}),
        },
      )
      .catch((err) =>
        this.logger.warn(
          `payout_failed push error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }
}
