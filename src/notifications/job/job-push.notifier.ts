import { Injectable, Logger } from '@nestjs/common';
import { PushDispatchService } from '../push/push-dispatch.service';
import { PushMessageFactory } from '../push/push-message.factory';
import { PUSH_EVENTS } from '../push/push-event.types';

/**
 * Beautician job-lifecycle pushes (SRP).
 * Customer booking lifecycle stays on BookingPushNotifier.
 * Emails remain on BeauticianNotificationService.
 */
@Injectable()
export class JobPushNotifier {
  private readonly logger = new Logger(JobPushNotifier.name);

  constructor(
    private readonly dispatch: PushDispatchService,
    private readonly factory: PushMessageFactory,
  ) {}

  /** When a new active offer is created for a beautician. */
  notifyOffer(input: {
    beauticianUserId: string;
    bookingId: string;
    offerId?: string;
    estEarnings: number;
    bookingCode?: string | null;
    distanceKm?: number | null;
    expiresAt?: string | null;
    serviceName?: string | null;
  }): void {
    const estLabel = this.factory.formatAmount(input.estEarnings);
    const distanceLabel = input.distanceKm != null ? input.distanceKm.toFixed(1) : null;
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.JOB_OFFER,
        {
          estEarnings: estLabel,
          bookingCode: input.bookingCode ?? '',
          distanceKm: distanceLabel ?? '',
        },
        {
          bookingId: input.bookingId,
          estEarnings: String(input.estEarnings),
          ...(input.offerId ? { offerId: input.offerId } : {}),
          ...(input.bookingCode ? { bookingCode: input.bookingCode } : {}),
          ...(distanceLabel ? { distanceKm: distanceLabel } : {}),
          ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
          ...(input.serviceName ? { serviceName: input.serviceName } : {}),
        },
      )
      .catch((err) => this.logErr('offer', err));
  }

  notifyOfferExpired(input: {
    beauticianUserId: string;
    bookingId: string;
    offerId?: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        'job.offer_expired' as never,
        {},
        {
          bookingId: input.bookingId,
          ...(input.offerId ? { offerId: input.offerId } : {}),
        },
      )
      .catch((err) => this.logErr('offer_expired', err));
  }

  /**
   * Concurrent-offer losers when another beautician accepts.
   * Fire one push per losing beautician.
   */
  notifyOfferTaken(input: {
    beauticianUserId: string;
    bookingId: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.JOB_OFFER_TAKEN,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('offer_taken', err));
  }

  /** Customer verified arrival PIN → beautician can start service. */
  notifyArrivalVerified(input: {
    beauticianUserId: string;
    bookingId: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.JOB_ARRIVAL_VERIFIED,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('arrival_verified', err));
  }

  /**
   * Beautician marked service complete → customer should confirm.
   * Owner: customer (plan §3.3).
   */
  notifyCompletionRequested(input: {
    customerUserId: string;
    bookingId: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.customerUserId,
        PUSH_EVENTS.JOB_COMPLETION_REQUESTED,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('completion_requested', err));
  }

  /** Booking fully completed (customer confirm or auto-finalize). */
  notifyCompleted(input: {
    beauticianUserId: string;
    bookingId: string;
  }): void {
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.JOB_COMPLETED,
        {},
        { bookingId: input.bookingId },
      )
      .catch((err) => this.logErr('completed', err));
  }

  private logErr(label: string, err: unknown) {
    this.logger.warn(
      `job push ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
