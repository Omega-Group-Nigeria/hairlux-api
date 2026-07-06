import { Injectable } from '@nestjs/common';
import { BookingCommsEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryCommsMetricsDto } from '../dto/query-comms-metrics.dto';
import {
  CommsAdminSessionView,
  CommsMetricsView,
} from '../types/comms-admin.types';

type SessionWithCounts = {
  id: string;
  bookingId: string;
  streamChannelId: string;
  streamCallCid: string | null;
  customerUserId: string;
  beauticianUserId: string;
  status: CommsAdminSessionView['status'];
  openedAt: Date;
  closedAt: Date | null;
  closeReason: CommsAdminSessionView['closeReason'];
  _count: {
    events: number;
  };
  events?: Array<{ eventType: BookingCommsEventType }>;
};

@Injectable()
export class CommsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(query: QueryCommsMetricsDto): Promise<CommsMetricsView> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      sessionsOpened,
      sessionsClosed,
      chatMessages,
      callsStarted,
      callsEnded,
    ] = await Promise.all([
      this.prisma.bookingCommsSession.count({
        where: { openedAt: { gte: from, lte: to } },
      }),
      this.prisma.bookingCommsSession.count({
        where: {
          closedAt: {
            gte: from,
            lte: to,
          },
        },
      }),
      this.prisma.bookingCommsEvent.count({
        where: {
          eventType: BookingCommsEventType.CHAT_MESSAGE,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.bookingCommsEvent.count({
        where: {
          eventType: BookingCommsEventType.CALL_STARTED,
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.bookingCommsEvent.count({
        where: {
          eventType: BookingCommsEventType.CALL_ENDED,
          createdAt: { gte: from, lte: to },
        },
      }),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      sessionsOpened,
      sessionsClosed,
      chatMessages,
      callsStarted,
      callsEnded,
    };
  }

  async getSessionForBooking(
    bookingId: string,
  ): Promise<CommsAdminSessionView | null> {
    const session = await this.prisma.bookingCommsSession.findUnique({
      where: { bookingId },
      include: {
        events: {
          select: { eventType: true },
        },
      },
    });

    if (!session) {
      return null;
    }

    return this.toAdminSessionView({
      ...session,
      _count: { events: session.events.length },
      events: session.events,
    });
  }

  private toAdminSessionView(session: SessionWithCounts): CommsAdminSessionView {
    const events = session.events ?? [];
    const chatMessages = events.filter(
      (event) => event.eventType === BookingCommsEventType.CHAT_MESSAGE,
    ).length;
    const callsStarted = events.filter(
      (event) => event.eventType === BookingCommsEventType.CALL_STARTED,
    ).length;
    const callsEnded = events.filter(
      (event) => event.eventType === BookingCommsEventType.CALL_ENDED,
    ).length;

    return {
      sessionId: session.id,
      bookingId: session.bookingId,
      status: session.status,
      streamChannelId: session.streamChannelId,
      streamCallCid: session.streamCallCid,
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() ?? null,
      closeReason: session.closeReason,
      customerUserId: session.customerUserId,
      beauticianUserId: session.beauticianUserId,
      eventSummary: {
        chatMessages,
        callsStarted,
        callsEnded,
      },
    };
  }
}