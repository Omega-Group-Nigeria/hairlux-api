import { ShopPushNotifier } from './shop-push.notifier';
import { PUSH_EVENTS } from '../push/push-event.types';

describe('ShopPushNotifier', () => {
  const dispatch = {
    sendEvent: jest.fn().mockResolvedValue({ sent: 1, skipped: false }),
  };
  let notifier: ShopPushNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new ShopPushNotifier(dispatch as never);
  });

  it('notifies order placed', async () => {
    notifier.notifyPlaced({
      userId: 'u1',
      orderId: 'ord-1',
      orderCode: 'SHP-ABC',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'u1',
      PUSH_EVENTS.SHOP_ORDER_PLACED,
      { orderCode: 'SHP-ABC' },
      { orderId: 'ord-1', orderCode: 'SHP-ABC' },
    );
  });

  it('notifies shipped / delivered / cancelled', async () => {
    notifier.notifyShipped({
      userId: 'u1',
      orderId: 'ord-1',
      orderCode: 'SHP-1',
    });
    notifier.notifyDelivered({
      userId: 'u1',
      orderId: 'ord-1',
      orderCode: 'SHP-1',
    });
    notifier.notifyCancelled({
      userId: 'u1',
      orderId: 'ord-1',
      orderCode: 'SHP-1',
    });
    await Promise.resolve();

    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'u1',
      PUSH_EVENTS.SHOP_ORDER_SHIPPED,
      { orderCode: 'SHP-1' },
      { orderId: 'ord-1', orderCode: 'SHP-1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'u1',
      PUSH_EVENTS.SHOP_ORDER_DELIVERED,
      { orderCode: 'SHP-1' },
      { orderId: 'ord-1', orderCode: 'SHP-1' },
    );
    expect(dispatch.sendEvent).toHaveBeenCalledWith(
      'u1',
      PUSH_EVENTS.SHOP_ORDER_CANCELLED,
      { orderCode: 'SHP-1' },
      { orderId: 'ord-1', orderCode: 'SHP-1' },
    );
  });
});
