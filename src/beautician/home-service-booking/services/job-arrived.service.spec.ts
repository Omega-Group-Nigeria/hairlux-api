import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { ArrivalPinService } from '../../arrival-verification/services/arrival-pin.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { JobArrivedService } from './job-arrived.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { BookingPushNotifier } from '../../../notifications/booking/booking-push.notifier';

describe('JobArrivedService', () => {
  let service: JobArrivedService;

  const booking = {
    id: 'booking-1',
    userId: 'customer-1',
    status: BookingStatus.EN_ROUTE,
    services: [],
    assignedBeauticianUserId: 'beautician-1',
    user: {
      id: 'customer-1',
      email: 'customer@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+2348099999999',
    },
    address: {
      fullAddress: '12 Admiralty Way, Lagos',
      latitude: 6.4474,
      longitude: 3.47,
    },
    assignedBeautician: null,
  };

  const mockParticipant = {
    getBookingForParticipant: jest.fn(async () => booking),
    assertAssignedBeautician: jest.fn(),
  };

  const mockPrisma = {
    booking: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...booking,
        ...data,
      })),
    },
  };

  const mockPinService = {
    generatePin: jest.fn(() => '123456'),
    storePin: jest.fn(),
    getPin: jest.fn(),
  };

  const mockSettings = {
    getSettings: jest.fn(async () => ({
      arrivalVerificationExpiryMinutes: 15,
      arrivalGeoFenceMeters: 250,
    })),
  };

  const mockNotification = {
    notifyArrivalVerificationNeeded: jest.fn().mockResolvedValue(undefined),
  };

  const mockCommsRealtime = {
    emitBookingStatus: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    booking.status = BookingStatus.EN_ROUTE;
    booking.address.latitude = 6.4474;
    booking.address.longitude = 3.47;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobArrivedService,
        HomeServiceStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BookingParticipantService, useValue: mockParticipant },
        { provide: ArrivalPinService, useValue: mockPinService },
        { provide: HomeServiceSettingsService, useValue: mockSettings },
        {
          provide: BeauticianNotificationService,
          useValue: mockNotification,
        },
        {
          provide: CommsRealtimeService,
          useValue: mockCommsRealtime,
        },
        {
          provide: BookingPushNotifier,
          useValue: {
            notifyArrived: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JobArrivedService>(JobArrivedService);
  });

  it('flags geo audit when beautician is outside the fence', async () => {
    const result = await service.markArrived('booking-1', 'beautician-1', {
      lat: 6.6,
      lng: 3.9,
    });

    expect(result.geoAuditFlag).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(250);
    expect(mockPinService.storePin).toHaveBeenCalledWith(
      'booking-1',
      expect.objectContaining({ geoAuditFlag: true }),
      15 * 60,
    );
  });

  it('does not block response on realtime emit', async () => {
    let resolveEmit!: () => void;
    const emitPending = new Promise<void>((resolve) => {
      resolveEmit = resolve;
    });
    mockCommsRealtime.emitBookingStatus.mockReturnValueOnce(emitPending);

    const resultPromise = service.markArrived('booking-1', 'beautician-1', {
      lat: 6.4474,
      lng: 3.47,
    });

    // Resolves without waiting for emit to finish
    const result = await resultPromise;
    expect(result.booking.status).toBe(BookingStatus.ARRIVED);
    expect(mockCommsRealtime.emitBookingStatus).toHaveBeenCalled();
    expect(mockNotification.notifyArrivalVerificationNeeded).toHaveBeenCalled();

    resolveEmit();
  });

  it('skips geo distance when address has no coordinates', async () => {
    booking.address.latitude = null as unknown as number;
    booking.address.longitude = null as unknown as number;

    const result = await service.markArrived('booking-1', 'beautician-1', {
      lat: 6.6,
      lng: 3.9,
    });

    expect(result.distanceMeters).toBeNull();
    expect(result.geoAuditFlag).toBe(false);
    expect(mockPrisma.booking.update).toHaveBeenCalled();
  });

  it('uses temporary booking coordinates when no saved address', async () => {
    const tempBooking = {
      ...booking,
      address: null,
      tempLatitude: 6.4474,
      tempLongitude: 3.47,
      tempFullAddress: 'Current location, Lekki',
    };
    mockParticipant.getBookingForParticipant.mockResolvedValueOnce(tempBooking);

    const result = await service.markArrived('booking-1', 'beautician-1', {
      lat: 6.4474,
      lng: 3.47,
    });

    expect(result.distanceMeters).toBe(0);
    expect(result.geoAuditFlag).toBe(false);
  });

  it('stores pin before updating booking status', async () => {
    const order: string[] = [];
    mockPinService.storePin.mockImplementation(async () => {
      order.push('pin');
    });
    mockPrisma.booking.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => {
        order.push('update');
        return { ...booking, ...data };
      },
    );

    await service.markArrived('booking-1', 'beautician-1', {
      lat: 6.4475,
      lng: 3.471,
    });

    expect(order).toEqual(['pin', 'update']);
  });
});
