import { Injectable, Logger } from '@nestjs/common';
import { PushDispatchService } from '../push/push-dispatch.service';
import { PUSH_EVENTS } from '../push/push-event.types';

/**
 * Customer booking + shared cancel pushes (SRP).
 * Does not send beautician job-offer pushes (separate domain).
 */
@Injectable()
export class BookingPushNotifier {
  private readonly logger = new Logger(BookingPushNotifier.name);

  constructor(private readonly dispatch: PushDispatchService) {}

  notifyConfirmed(input: {
    userId: string;
    bookingId: string;
    reservationCode?: string | null;
  }): void {
    void this.dispatch
      .sendEvent(
        input.userId,
        PUSH_EVENTS.BOOKING_CONFIRMED,
        { reservationCode: input.reservationCode ?? '' },
        {
          bookingId: input.bookingId,
          ...(input.reservationCode
            ? { reservationCode: input.reservationCode }
            : {}),
        },
      )
      .catch((err) => this.logErr('confirmed', err));
  }

  notifyBeauticianAssigned(input: {
    customerUserId: string;
    bookingId: string;
    beauticianUserId?: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.BOOKING_BEAUTICIAN_ASSIGNED,
        {},
        {
          bookingId: input.bookingId,
          ...(input.beauticianUserId
            ? { beauticianUserId: input.beauticianUserId }
            : {}),
        },
      )
      .catch((err) => this.logErr('beautician_assigned', err));
  }

  notifyEnRoute(input: { customerUserId: string; bookingId: string }): void {
    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.BOOKING_EN_ROUTE,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('en_route', err));
  }

  notifyArrived(input: { customerUserId: string; bookingId: string }): void {
    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.BOOKING_ARRIVED,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('arrived', err));
  }

  notifyCompleted(input: {
    customerUserId: string;
    bookingId: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.BOOKING_COMPLETED,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('completed', err));
  }

  /**
   * Customer always; beautician when assigned (plan §3.2).
   */
  notifyCancelled(input: {
    customerUserId: string;
    bookingId: string;
    reservationCode?: string | null;
    assignedBeauticianUserId?: string | null;
  }): void {
    const data = {
      bookingId: input.bookingId,
      ...(input.reservationCode
        ? { reservationCode: input.reservationCode }
        : {}),
    };
    const vars = { reservationCode: input.reservationCode ?? '' };

    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.BOOKING_CANCELLED,
        vars,
        data,
      )
      .catch((err) => this.logErr('cancelled:customer', err));

    if (input.assignedBeauticianUserId) {
      void this.dispatch
        .sendEvent(
          input.assignedBeauticianUserId,
          PUSH_EVENTS.BOOKING_CANCELLED,
          vars,
          data,
        )
        .catch((err) => this.logErr('cancelled:beautician', err));
    }
  }

  private logErr(label: string, err: unknown) {
    this.logger.warn(
      `booking push ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
