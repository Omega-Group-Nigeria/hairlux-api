import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  BookingCommsCloseReason,
  BookingCommsSessionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { buildStreamChannelId } from '../constants/comms.constants';
import { CommsAccessService } from './comms-access.service';
import { CommsPresenterService } from './comms-presenter.service';
import { StreamCallService } from './stream-call.service';
import { StreamChannelService } from './stream-channel.service';
import { StreamClientService } from './stream-client.service';
import { StreamDeviceSyncService } from './stream-device-sync.service';
import { StreamUserSyncService } from './stream-user-sync.service';

@Injectable()
export class CommsSessionService {
  private readonly logger = new Logger(CommsSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamClient: StreamClientService,
    private readonly streamUserSync: StreamUserSyncService,
    private readonly streamChannel: StreamChannelService,
    private readonly streamCall: StreamCallService,
    private readonly streamDeviceSync: StreamDeviceSyncService,
    private readonly accessService: CommsAccessService,
    private readonly presenter: CommsPresenterService,
  ) {}

  async openForBooking(bookingId: string): Promise<void> {
    if (!this.streamClient.isConfigured()) {
      this.logger.warn(
        `Skipping comms open for ${bookingId}: Stream is not configured`,
      );
      return;
    }

    const booking = await this.accessService.getBookingForCommsAccess(bookingId);

    if (!this.accessService.isHomeServiceBooking(booking.bookingType)) {
      return;
    }

    if (!booking.assignedBeauticianUserId || !booking.assignedBeautician) {
      throw new BadRequestException(
        'Booking must have an assigned beautician before opening comms',
      );
    }

    if (booking.commsSession?.status === BookingCommsSessionStatus.ACTIVE) {
      if (
        booking.commsSession.beauticianUserId ===
        booking.assignedBeauticianUserId
      ) {
        return;
      }

      await this.closeForBooking(
        bookingId,
        BookingCommsCloseReason.REASSIGNED,
      );
    }

    const streamChannelId = buildStreamChannelId(bookingId);
    const customerDisplayName = this.accessService.buildDisplayName(
      booking.user.firstName,
      booking.user.lastName,
    );
    const beauticianDisplayName = this.accessService.buildDisplayName(
      booking.assignedBeautician.firstName,
      booking.assignedBeautician.lastName,
    );

    await this.streamDeviceSync.syncParticipants([
      booking.userId,
      booking.assignedBeauticianUserId,
    ]);

    await this.streamUserSync.upsertParticipants([
      {
        userId: booking.userId,
        displayName: customerDisplayName,
      },
      {
        userId: booking.assignedBeauticianUserId,
        displayName: beauticianDisplayName,
        imageUrl: booking.assignedBeautician.beauticianProfile?.profilePhotoUrl,
      },
    ]);

    await this.streamChannel.ensureBookingChannel({
      streamChannelId,
      createdByUserId: booking.userId,
      memberUserIds: [booking.userId, booking.assignedBeauticianUserId],
      bookingId,
      reservationCode: booking.reservationCode,
    });

    let streamCallCid: string | null = null;

    try {
      streamCallCid = await this.streamCall.ensureBookingCall({
        bookingId,
        customerUserId: booking.userId,
        beauticianUserId: booking.assignedBeauticianUserId,
        reservationCode: booking.reservationCode,
      });
    } catch (error) {
      this.logger.error(
        `Failed to ensure Stream call for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const now = new Date();

    await this.prisma.bookingCommsSession.upsert({
      where: { bookingId },
      create: {
        bookingId,
        streamChannelId,
        streamCallCid,
        customerUserId: booking.userId,
        beauticianUserId: booking.assignedBeauticianUserId,
        status: BookingCommsSessionStatus.ACTIVE,
        openedAt: now,
        closedAt: null,
        closeReason: null,
      },
      update: {
        streamChannelId,
        streamCallCid,
        customerUserId: booking.userId,
        beauticianUserId: booking.assignedBeauticianUserId,
        status: BookingCommsSessionStatus.ACTIVE,
        openedAt: now,
        closedAt: null,
        closeReason: null,
      },
    });

    this.logger.log(`Opened comms session for booking ${bookingId}`);
  }

  async closeForBooking(
    bookingId: string,
    reason: BookingCommsCloseReason,
  ): Promise<void> {
    const session = await this.prisma.bookingCommsSession.findUnique({
      where: { bookingId },
    });

    if (!session || session.status === BookingCommsSessionStatus.CLOSED) {
      return;
    }

    if (this.streamClient.isConfigured()) {
      try {
        await this.streamCall.endBookingCall(bookingId);
      } catch (error) {
        this.logger.error(
          `Failed to end Stream call for booking ${bookingId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      try {
        await this.streamChannel.freezeChannel(session.streamChannelId);
      } catch (error) {
        this.logger.error(
          `Failed to freeze Stream channel for booking ${bookingId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.prisma.bookingCommsSession.update({
      where: { bookingId },
      data: {
        status: BookingCommsSessionStatus.CLOSED,
        closedAt: new Date(),
        closeReason: reason,
      },
    });

    this.logger.log(`Closed comms session for booking ${bookingId} (${reason})`);
  }

  async getBookingCommsForUser(bookingId: string, requesterUserId: string) {
    const booking = await this.accessService.getBookingForCommsAccess(bookingId);
    this.accessService.assertParticipant(booking, requesterUserId);
    return this.presenter.toBookingCommsView(booking);
  }

  async openForBookingSafely(bookingId: string): Promise<void> {
    try {
      await this.openForBooking(bookingId);
    } catch (error) {
      this.logger.error(
        `Failed to open comms for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async closeForBookingSafely(
    bookingId: string,
    reason: BookingCommsCloseReason,
  ): Promise<void> {
    try {
      await this.closeForBooking(bookingId, reason);
    } catch (error) {
      this.logger.error(
        `Failed to close comms for booking ${bookingId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}