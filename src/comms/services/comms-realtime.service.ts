import { Injectable } from '@nestjs/common';
import { RealtimePublisherService } from '../../beautician/realtime/realtime-publisher.service';
import { CommsAccessService } from './comms-access.service';
import { CommsPresenterService } from './comms-presenter.service';
import { CommsRealtimePayload } from '../types/comms.types';

@Injectable()
export class CommsRealtimeService {
  constructor(
    private readonly accessService: CommsAccessService,
    private readonly presenter: CommsPresenterService,
    private readonly realtimePublisher: RealtimePublisherService,
  ) {}

  async emitBookingStatus(
    bookingId: string,
    status: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const comms = await this.resolveRealtimeComms(bookingId);

    this.realtimePublisher.emitBookingStatus(bookingId, status, {
      ...extra,
      ...(comms ? { comms } : {}),
    });
  }

  private async resolveRealtimeComms(
    bookingId: string,
  ): Promise<CommsRealtimePayload | null> {
    try {
      const booking =
        await this.accessService.getBookingForCommsAccess(bookingId);

      if (!this.accessService.isHomeServiceBooking(booking.bookingType)) {
        return null;
      }

      const view = this.presenter.toBookingCommsView(booking);
      return this.presenter.toRealtimePayload(view);
    } catch {
      return null;
    }
  }
}