import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { ArrivalPinService } from '../../arrival-verification/services/arrival-pin.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { BookingParticipantService } from './booking-participant.service';
import { HomeServiceStatusService } from '../home-service-status.service';
import { JobArrivedService } from './job-arrived.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';

describe('JobArrivedService', () => {
  let service: JobArrivedService;

  const booking = {
    id: 'booking-1',
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

  beforeEach(async () => {
    jest.clearAllMocks();
    booking.status = BookingStatus.EN_ROUTE;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobArrivedService,
        HomeServiceStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BookingParticipantService, useValue: mockParticipant },
        { provide: ArrivalPinService, useValue: mockPinService },
        { provide: HomeServiceSettingsService, useValue: mockSettings },
        { provide: GeocodingService, useValue: { geocodeAddress: jest.fn() } },
        {
          provide: BeauticianNotificationService,
          useValue: { notifyArrivalVerificationNeeded: jest.fn() },
        },
        {
          provide: CommsRealtimeService,
          useValue: { emitBookingStatus: jest.fn().mockResolvedValue(undefined) },
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
});