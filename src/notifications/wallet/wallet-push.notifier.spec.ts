import { WalletPushNotifier } from './wallet-push.notifier';
import { PushMessageFactory } from '../push/push-message.factory';
import { PUSH_EVENTS } from '../push/push-event.types';

describe('WalletPushNotifier', () => {
  const dispatch = {
    sendEvent: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  const factory = new PushMessageFactory();
  let notifier: WalletPushNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new WalletPushNotifier(dispatch as never, factory);
  });

  it('dispatches deposit_success with type and amount data', async () => {
    notifier.notifyDepositSuccess({
      userId: 'user-1',
      amount: 5000,
      reference: 'REF-1',
      newBalance: 12000,
    });

    // allow microtask for void promise
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'user-1',
      PUSH_EVENTS.WALLET_DEPOSIT_SUCCESS,
      { amount: '5,000' },
      {
        amount: '5000',
        reference: 'REF-1',
        newBalance: '12000',
      },
    );
  });

  it('dispatches payout_completed', async () => {
    notifier.notifyPayoutCompleted({
      userId: 'beautician-1',
      amount: 8000,
      reference: 'TRF_abc',
      payoutRequestId: 'payout-1',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'beautician-1',
      PUSH_EVENTS.WALLET_PAYOUT_COMPLETED,
      { amount: '8,000' },
      expect.objectContaining({
        amount: '8000',
        reference: 'TRF_abc',
        payoutRequestId: 'payout-1',
      }),
    );
  });

  it('dispatches payout_failed with reason', async () => {
    notifier.notifyPayoutFailed({
      userId: 'beautician-1',
      amount: 3000,
      reference: 'TRF_fail',
      reason: 'Insufficient funds at bank',
      payoutRequestId: 'payout-2',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'beautician-1',
      PUSH_EVENTS.WALLET_PAYOUT_FAILED,
      {
        amount: '3,000',
        reasonSuffix: ' Insufficient funds at bank',
      },
      expect.objectContaining({
        reason: 'Insufficient funds at bank',
      }),
    );
  });
});
