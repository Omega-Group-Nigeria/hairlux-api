import {
  BookingCommsSessionStatus,
  BookingStatus,
} from '@prisma/client';
import { CommsAccessService } from './comms-access.service';
import { CommsPresenterService } from './comms-presenter.service';

describe('CommsPresenterService', () => {
  let presenter: CommsPresenterService;

  beforeEach(() => {
    presenter = new CommsPresenterService(new CommsAccessService({} as never));
  });

  it('returns active comms flags for assigned bookings', () => {
    const view = presenter.toBookingCommsView({
      id: 'booking-1',
      status: BookingStatus.IN_PROGRESS,
      commsSession: {
        streamChannelId: 'booking-booking-1',
        status: BookingCommsSessionStatus.ACTIVE,
        closeReason: null,
      },
      user: {
        id: 'customer-1',
        firstName: 'Amara',
        lastName: 'Okafor',
      },
      assignedBeautician: {
        id: 'beautician-1',
        firstName: 'Chioma',
        lastName: 'Eze',
      },
    });

    expect(view.canChat).toBe(true);
    expect(view.canCall).toBe(true);
    expect(view.channelId).toBe('booking-booking-1');
    expect(view.callType).toBe('default');
    expect(view.callId).toBe('booking-booking-1');
  });

  it('returns null for non-home-service bookings', () => {
    const view = presenter.embedForBooking({
      id: 'booking-1',
      bookingType: 'WALK_IN' as never,
      status: BookingStatus.CONFIRMED,
      commsSession: null,
      user: { id: 'customer-1', firstName: 'Amara', lastName: 'Okafor' },
      assignedBeautician: null,
    });

    expect(view).toBeNull();
  });

  it('maps realtime payload from booking comms view', () => {
    const view = presenter.toBookingCommsView({
      id: 'booking-1',
      status: BookingStatus.ASSIGNED,
      commsSession: {
        streamChannelId: 'booking-booking-1',
        status: BookingCommsSessionStatus.ACTIVE,
        closeReason: null,
      },
      user: {
        id: 'customer-1',
        firstName: 'Amara',
        lastName: 'Okafor',
      },
      assignedBeautician: {
        id: 'beautician-1',
        firstName: 'Chioma',
        lastName: 'Eze',
      },
    });

    expect(presenter.toRealtimePayload(view)).toEqual({
      channelId: 'booking-booking-1',
      callType: 'default',
      callId: 'booking-booking-1',
      canChat: true,
      canCall: true,
    });
  });
});