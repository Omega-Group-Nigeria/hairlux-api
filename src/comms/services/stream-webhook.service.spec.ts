jest.mock('./stream-video-client.service', () => ({
  StreamVideoClientService: jest.fn(),
}));

import { BookingCommsEventType } from '@prisma/client';
import { StreamWebhookService } from './stream-webhook.service';
import { CommsEventService } from './comms-event.service';

describe('StreamWebhookService', () => {
  const mockPrisma = {
    bookingCommsSession: {
      findUnique: jest.fn(),
    },
  };

  const mockEventService = {
    recordEvent: jest.fn(),
    updateSessionCallCid: jest.fn(),
  };

  let service: StreamWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StreamWebhookService(
      mockPrisma as never,
      {} as never,
      mockEventService as unknown as CommsEventService,
    );
  });

  it('records chat message metadata for booking channels', async () => {
    mockPrisma.bookingCommsSession.findUnique.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-uuid',
    });
    mockEventService.recordEvent.mockResolvedValue(true);

    const result = await service.processEvent({
      type: 'message.new',
      message_id: 'msg-1',
      channel_id: 'booking-booking-uuid',
      message: { user: { id: 'customer-1' } },
    } as never);

    expect(result).toEqual({ processed: true, duplicate: false });
    expect(mockEventService.recordEvent).toHaveBeenCalledWith({
      sessionId: 'session-1',
      eventType: BookingCommsEventType.CHAT_MESSAGE,
      actorUserId: 'customer-1',
      streamEventId: 'message.new:msg-1',
      payload: {
        channelId: 'booking-booking-uuid',
        messageId: 'msg-1',
      },
    });
  });

  it('is idempotent for duplicate stream events', async () => {
    mockPrisma.bookingCommsSession.findUnique.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-uuid',
    });
    mockEventService.recordEvent.mockResolvedValue(false);

    const result = await service.processEvent({
      type: 'call.session_started',
      call_cid: 'default:booking-booking-uuid',
      session_id: 'call-session-1',
    } as never);

    expect(result).toEqual({ processed: true, duplicate: true });
    expect(mockEventService.updateSessionCallCid).not.toHaveBeenCalled();
  });

  it('records call ended metadata', async () => {
    mockPrisma.bookingCommsSession.findUnique.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-uuid',
    });
    mockEventService.recordEvent.mockResolvedValue(true);

    const result = await service.processEvent({
      type: 'call.ended',
      created_at: new Date('2026-07-03T12:00:00.000Z'),
      call: { cid: 'default:booking-booking-uuid' },
    } as never);

    expect(result).toEqual({ processed: true, duplicate: false });
    expect(mockEventService.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BookingCommsEventType.CALL_ENDED,
        streamEventId: 'call.ended:default:booking-booking-uuid:2026-07-03T12:00:00.000Z',
      }),
    );
  });

  it('updates stream call cid when a call starts', async () => {
    mockPrisma.bookingCommsSession.findUnique.mockResolvedValue({
      id: 'session-1',
      bookingId: 'booking-uuid',
    });
    mockEventService.recordEvent.mockResolvedValue(true);

    await service.processEvent({
      type: 'call.session_started',
      call_cid: 'default:booking-booking-uuid',
      session_id: 'call-session-1',
    } as never);

    expect(mockEventService.updateSessionCallCid).toHaveBeenCalledWith(
      'session-1',
      'default:booking-booking-uuid',
    );
  });
});