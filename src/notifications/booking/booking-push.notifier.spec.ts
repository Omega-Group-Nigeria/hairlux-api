import { BookingPushNotifier } from './booking-push.notifier';
import { PUSH_EVENTS } from '../push/push-event.types';

describe('BookingPushNotifier', () => {
  const dispatch = {
    sendEvent: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  let notifier: BookingPushNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new BookingPushNotifier(dispatch as never);
  });

  it('notifies booking confirmed', async () => {
    notifier.notifyConfirmed({
      userId: 'c1',
      bookingId: 'b1',
      reservationCode: 'HLX-1',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_CONFIRMED,
      { reservationCode: 'HLX-1' },
      { bookingId: 'b1', reservationCode: 'HLX-1' },
    );
  });

  it('notifies cancel to customer and assigned beautician', async () => {
    notifier.notifyCancelled({
      customerUserId: 'c1',
      bookingId: 'b1',
      reservationCode: 'HLX-9',
      assignedBeauticianUserId: 'beautician-1',
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledTimes(2);
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_CANCELLED,
      expect.any(Object),
      expect.objectContaining({ bookingId: 'b1' }),
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'beautician-1',
      PUSH_EVENTS.BOOKING_CANCELLED,
      expect.any(Object),
      expect.objectContaining({ bookingId: 'b1' }),
    );
  });

  it('notifies assigned / en_route / arrived / completed', async () => {
    notifier.notifyBeauticianAssigned({
      customerUserId: 'c1',
      bookingId: 'b1',
      beauticianUserId: 'be1',
    });
    notifier.notifyEnRoute({ customerUserId: 'c1', bookingId: 'b1' });
    notifier.notifyArrived({ customerUserId: 'c1', bookingId: 'b1' });
    notifier.notifyCompleted({ customerUserId: 'c1', bookingId: 'b1' });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_BEAUTICIAN_ASSIGNED,
      {},
      expect.objectContaining({ bookingId: 'b1', beauticianUserId: 'be1' }),
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_EN_ROUTE,
      {},
      { bookingId: 'b1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_ARRIVED,
      {},
      { bookingId: 'b1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'c1',
      PUSH_EVENTS.BOOKING_COMPLETED,
      {},
      { bookingId: 'b1' },
    );
  });
});
