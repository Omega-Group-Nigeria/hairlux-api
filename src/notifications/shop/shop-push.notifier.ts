import { Injectable, Logger } from '@nestjs/common';
import { PushDispatchService } from '../push/push-dispatch.service';
import { PUSH_EVENTS, type PushEventKey } from '../push/push-event.types';

/**
 * Customer shop-order lifecycle pushes (SRP).
 * Call after successful purchase / admin status change — not from payment SDK code.
 */
@Injectable()
export class ShopPushNotifier {
  private readonly logger = new Logger(ShopPushNotifier.name);

  constructor(private readonly dispatch: PushDispatchService) {}

  notifyPlaced(input: {
    userId: string;
    orderId: string;
    orderCode: string;
  }): void {
    this.send(
      input.userId,
      PUSH_EVENTS.SHOP_ORDER_PLACED,
      input.orderId,
      input.orderCode,
      'placed',
    );
  }

  notifyShipped(input: {
    userId: string;
    orderId: string;
    orderCode: string;
  }): void {
    this.send(
      input.userId,
      PUSH_EVENTS.SHOP_ORDER_SHIPPED,
      input.orderId,
      input.orderCode,
      'shipped',
    );
  }

  notifyDelivered(input: {
    userId: string;
    orderId: string;
    orderCode: string;
  }): void {
    this.send(
      input.userId,
      PUSH_EVENTS.SHOP_ORDER_DELIVERED,
      input.orderId,
      input.orderCode,
      'delivered',
    );
  }

  notifyCancelled(input: {
    userId: string;
    orderId: string;
    orderCode: string;
  }): void {
    this.send(
      input.userId,
      PUSH_EVENTS.SHOP_ORDER_CANCELLED,
      input.orderId,
      input.orderCode,
      'cancelled',
    );
  }

  private send(
    userId: string,
    event: PushEventKey,
    orderId: string,
    orderCode: string,
    label: string,
  ): void {
    void this.dispatch
      .sendEvent(
        userId,
        event,
        { orderCode },
        { orderId, orderCode },
      )
      .catch((err) =>
        this.logger.warn(
          `shop push ${label}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }
}
