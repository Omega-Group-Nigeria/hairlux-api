import { BookingCommsCloseReason, BookingCommsSessionStatus } from '@prisma/client';

export interface CommsParticipantView {
  userId: string;
  displayName: string;
}

export interface CommsBookingView {
  bookingId: string;
  channelId: string | null;
  callType: string;
  callId: string | null;
  sessionStatus: BookingCommsSessionStatus | 'NONE';
  canChat: boolean;
  canCall: boolean;
  closeReason: BookingCommsCloseReason | null;
  participants: {
    customer: CommsParticipantView;
    beautician: CommsParticipantView;
  } | null;
}

export interface CommsRealtimePayload {
  channelId: string | null;
  callType: string;
  callId: string | null;
  canChat: boolean;
  canCall: boolean;
}

export interface StreamUserProfile {
  userId: string;
  displayName: string;
  imageUrl?: string | null;
}