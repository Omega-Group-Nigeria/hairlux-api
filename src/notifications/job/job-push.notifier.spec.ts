import { JobPushNotifier } from './job-push.notifier';
import { PushMessageFactory } from '../push/push-message.factory';
import { PUSH_EVENTS } from '../push/push-event.types';

describe('JobPushNotifier', () => {
  const dispatch = {
    sendEvent: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  const factory = new PushMessageFactory();
  let notifier: JobPushNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new JobPushNotifier(dispatch as never, factory);
  });

  it('notifies job offer with earnings', async () => {
    notifier.notifyOffer({
      beauticianUserId: 'be1',
      bookingId: 'b1',
      offerId: 'o1',
      estEarnings: 12000,
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.JOB_OFFER,
      { estEarnings: '12,000', bookingCode: '', distanceKm: '' },
      {
        bookingId: 'b1',
        estEarnings: '12000',
        offerId: 'o1',
      },
    );
  });

  it('notifies offer taken', async () => {
    notifier.notifyOfferTaken({
      beauticianUserId: 'loser-1',
      bookingId: 'b1',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'loser-1',
      PUSH_EVENTS.JOB_OFFER_TAKEN,
      {},
      { bookingId: 'b1' },
    );
  });

  it('notifies arrival verified / completion requested / completed', async () => {
    notifier.notifyArrivalVerified({
      beauticianUserId: 'be1',
      bookingId: 'b1',
    });
    notifier.notifyCompletionRequested({
      customerUserId: 'c1',
      bookingId: 'b1',
    });
    notifier.notifyCompleted({
      beauticianUserId: 'be1',
      bookingId: 'b1',
    });
    notifier.notifyCompleted({
      beauticianUserId: 'be1',
      bookingId: 'b2',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.JOB_ARRIVAL_VERIFIED,
      {},
      { bookingId: 'b1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.JOB_COMPLETION_REQUESTED,
      {},
      { bookingId: 'b1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.JOB_COMPLETED,
      {},
      { bookingId: 'b1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'be1',
      PUSH_EVENTS.JOB_COMPLETED,
      {},
      { bookingId: 'b2' },
    );
  });
});
