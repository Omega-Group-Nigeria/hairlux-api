import { PushDispatchService } from './push-dispatch.service';
import { PushMessageFactory } from './push-message.factory';
import { PUSH_EVENTS } from './push-event.types';

describe('PushDispatchService', () => {
  const factory = new PushMessageFactory();
  const push = {
    sendToUser: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  const config = {
    get: jest.fn().mockReturnValue(undefined),
  };

  let service: PushDispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(undefined);
    push.sendToUser.mockResolvedValue({ sent: 1, skipped: false });
    service = new PushDispatchService(
      factory,
      push as never,
      config as never,
    );
  });

  it('resolves copy and sends with data.type = event key', async () => {
    const result = await service.sendEvent(
      'user-1',
      PUSH_EVENTS.BOOKING_CONFIRMED,
      { reservationCode: 'HLX-1' },
      { bookingId: 'b1', reservationCode: 'HLX-1' },
    );

    expect(result.sent).toBe(1);
    expect(push.sendToUser).toHaveBeenCalledWith('user-1', {
      title: 'Booking confirmed',
      body: 'Your booking HLX-1 is confirmed.',
      data: {
        type: 'booking.confirmed',
        bookingId: 'b1',
        reservationCode: 'HLX-1',
      },
    });
  });

  it('skips when PUSH_NOTIFICATIONS_ENABLED is false', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'PUSH_NOTIFICATIONS_ENABLED' ? 'false' : undefined,
    );

    const result = await service.sendEvent(
      'user-1',
      PUSH_EVENTS.SHOP_ORDER_PLACED,
      { orderCode: 'SHP-1' },
      { orderId: 'o1', orderCode: 'SHP-1' },
    );

    expect(result).toEqual({
      sent: 0,
      skipped: true,
      reason: 'feature_disabled',
    });
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('never throws when FCM transport fails', async () => {
    push.sendToUser.mockRejectedValue(new Error('network'));

    const result = await service.sendEvent(
      'user-1',
      PUSH_EVENTS.WALLET_DEPOSIT_SUCCESS,
      { amount: '1,000' },
      { amount: '1000', reference: 'ref' },
    );

    expect(result.skipped).toBe(true);
    expect(result.sent).toBe(0);
  });

  it('treats empty flag as enabled', () => {
    config.get.mockReturnValue('');
    expect(service.isGloballyEnabled()).toBe(true);
  });
});
