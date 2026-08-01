import {
  BookingCommsCloseReason,
  BookingCommsEventType,
  BookingCommsSessionStatus,
} from '@prisma/client';

export interface CommsAdminSessionView {
  sessionId: string;
  bookingId: string;
  status: BookingCommsSessionStatus;
  streamChannelId: string;
  streamCallCid: string | null;
  openedAt: string;
  closedAt: string | null;
  closeReason: BookingCommsCloseReason | null;
  customerUserId: string;
  beauticianUserId: string;
  eventSummary: {
    chatMessages: number;
    callsStarted: number;
    callsEnded: number;
  };
}

export interface CommsMetricsView {
  from: string;
  to: string;
  sessionsOpened: number;
  sessionsClosed: number;
  chatMessages: number;
  callsStarted: number;
  callsEnded: number;
}

export interface CommsEventRecordInput {
  sessionId: string;
  eventType: BookingCommsEventType;
  actorUserId?: string | null;
  streamEventId: string;
  payload?: Record<string, unknown> | null;
}