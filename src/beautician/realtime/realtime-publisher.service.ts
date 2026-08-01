import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import { REALTIME_EVENTS, realtimeRoom } from './realtime.constants';

@Injectable()
export class RealtimePublisherService {
  private readonly logger = new Logger(RealtimePublisherService.name);
  private server?: Server;

  setServer(server: Server) {
    this.server = server;
  }

  emitBookingLocation(
    bookingId: string,
    payload: {
      lat: number;
      lng: number;
      accuracy?: number | null;
      updatedAt: string;
    },
  ) {
    this.emitToRoom(
      realtimeRoom.booking(bookingId),
      REALTIME_EVENTS.BOOKING_LOCATION,
      { bookingId, ...payload },
    );
  }

  emitBookingStatus(bookingId: string, status: string, extra?: Record<string, unknown>) {
    this.emitToRoom(realtimeRoom.booking(bookingId), REALTIME_EVENTS.BOOKING_STATUS, {
      bookingId,
      status,
      ...extra,
    });
  }

  emitJobOffer(
    beauticianUserId: string,
    payload: {
      offerId: string;
      bookingId: string;
      estEarnings: number;
      expiresAt: string;
      distanceKm?: number | null;
    },
  ) {
    this.emitToRoom(
      realtimeRoom.beauticianOffers(beauticianUserId),
      REALTIME_EVENTS.JOB_OFFER,
      payload,
    );
  }

  emitOfferExpired(beauticianUserId: string, bookingId: string) {
    this.emitToRoom(
      realtimeRoom.beauticianOffers(beauticianUserId),
      REALTIME_EVENTS.OFFER_EXPIRED,
      { bookingId },
    );
  }

  private emitToRoom(room: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.debug(`Realtime skipped (socket unavailable): ${event}`);
      return;
    }

    this.server.to(room).emit(event, payload);
  }
}