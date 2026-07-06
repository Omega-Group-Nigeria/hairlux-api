jest.mock('./stream-video-client.service', () => ({
  StreamVideoClientService: jest.fn(),
}));

import { StreamCallService } from './stream-call.service';
import { StreamVideoClientService } from './stream-video-client.service';

describe('StreamCallService', () => {
  const mockEnd = jest.fn().mockResolvedValue({ duration: '0ms' });
  const mockGetOrCreate = jest.fn().mockResolvedValue({ created: true });

  const mockVideoClient = {
    isConfigured: jest.fn(() => true),
    getClient: jest.fn(() => ({
      video: {
        call: jest.fn(() => ({
          getOrCreate: mockGetOrCreate,
          end: mockEnd,
        })),
      },
    })),
  };

  let service: StreamCallService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StreamCallService(
      mockVideoClient as unknown as StreamVideoClientService,
    );
  });

  it('builds deterministic call cid for a booking', () => {
    expect(service.buildCallCid('booking-uuid')).toBe(
      'default:booking-booking-uuid',
    );
  });

  it('ensures booking audio call with members', async () => {
    const callCid = await service.ensureBookingCall({
      bookingId: 'booking-uuid',
      customerUserId: 'customer-1',
      beauticianUserId: 'beautician-1',
      reservationCode: 'HLX-123',
    });

    expect(callCid).toBe('default:booking-booking-uuid');
    expect(mockGetOrCreate).toHaveBeenCalledWith({
      video: false,
      data: {
        created_by_id: 'customer-1',
        members: [{ user_id: 'customer-1' }, { user_id: 'beautician-1' }],
        custom: {
          bookingId: 'booking-uuid',
          reservationCode: 'HLX-123',
          bookingType: 'HOME_SERVICE',
        },
      },
    });
  });

  it('ends booking call without throwing when Stream errors', async () => {
    mockEnd.mockRejectedValueOnce(new Error('call not found'));

    await expect(service.endBookingCall('booking-uuid')).resolves.toBeUndefined();
  });
});