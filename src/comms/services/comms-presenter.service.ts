import { Injectable } from '@nestjs/common';
import {
  BookingCommsCloseReason,
  BookingCommsSessionStatus,
  BookingStatus,
  BookingType,
} from '@prisma/client';
import {
  buildStreamCallId,
  COMMS_CALL_TYPE,
} from '../constants/comms.constants';
import { CommsAccessService } from './comms-access.service';
import {
  CommsBookingView,
  CommsRealtimePayload,
} from '../types/comms.types';

type BookingWithCommsContext = {
  id: string;
  status: BookingStatus;
  commsSession: {
    streamChannelId: string;
    streamCallCid: string | null;
    status: BookingCommsSessionStatus;
    closeReason: BookingCommsCloseReason | null;
  } | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  assignedBeautician: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
};

type CommsEmbedBooking = {
  id: string;
  bookingType: BookingType;
  status: BookingStatus;
  commsSession: BookingWithCommsContext['commsSession'];
  user: BookingWithCommsContext['user'];
  assignedBeautician: BookingWithCommsContext['assignedBeautician'];
};

@Injectable()
export class CommsPresenterService {
  constructor(private readonly accessService: CommsAccessService) {}

  embedForBooking(booking: CommsEmbedBooking): CommsBookingView | null {
    if (!this.accessService.isHomeServiceBooking(booking.bookingType)) {
      return null;
    }

    return this.toBookingCommsView({
      id: booking.id,
      status: booking.status,
      commsSession: booking.commsSession,
      user: booking.user,
      assignedBeautician: booking.assignedBeautician,
    });
  }

  toRealtimePayload(view: CommsBookingView): CommsRealtimePayload {
    return {
      channelId: view.channelId,
      callType: view.callType,
      callId: view.callId,
      canChat: view.canChat,
      canCall: view.canCall,
    };
  }

  toBookingCommsView(booking: BookingWithCommsContext): CommsBookingView {
    const session = booking.commsSession;
    const canUse = this.accessService.canUseComms(
      booking.status,
      session?.status,
    );

    const callId = session ? buildStreamCallId(booking.id) : null;

    if (!session || !booking.assignedBeautician) {
      return {
        bookingId: booking.id,
        channelId: session?.streamChannelId ?? null,
        callType: COMMS_CALL_TYPE,
        callId,
        sessionStatus: session?.status ?? 'NONE',
        canChat: false,
        canCall: false,
        closeReason: session?.closeReason ?? null,
        participants: null,
      };
    }

    return {
      bookingId: booking.id,
      channelId: session.streamChannelId,
      callType: COMMS_CALL_TYPE,
      callId,
      sessionStatus: session.status,
      canChat: canUse,
      canCall: canUse,
      closeReason: session.closeReason,
      participants: {
        customer: {
          userId: booking.user.id,
          displayName: this.accessService.buildDisplayName(
            booking.user.firstName,
            booking.user.lastName,
          ),
        },
        beautician: {
          userId: booking.assignedBeautician.id,
          displayName: this.accessService.buildDisplayName(
            booking.assignedBeautician.firstName,
            booking.assignedBeautician.lastName,
          ),
        },
      },
    };
  }
}