import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BookingParticipantService } from '../../home-service-booking/services/booking-participant.service';
import { HomeServiceStatusService } from '../../home-service-booking/home-service-status.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { ArrivalPinService } from './arrival-pin.service';
import { ArrivalQrTokenService } from './arrival-qr-token.service';
import { VerifyArrivalService } from './verify-arrival.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

describe('VerifyArrivalService', () => {
  let service: VerifyArrivalService;

  const booking = {
    id: 'booking-1',
    userId: 'customer-1',
    status: BookingStatus.ARRIVED,
    services: [
      {
        serviceId: 'svc-1',
        name: 'Braids',
        price: 100,
        quantity: 1,
        duration: 60,
      },
    ],
    assignedBeauticianUserId: 'beautician-1',
    assignedBeautician: {
      id: 'beautician-1',
      email: 'beautician@example.com',
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: '+2348012345678',
    },
    user: {
      id: 'customer-1',
      email: 'customer@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+2348099999999',
    },
    address: null,
  };

  const pinRecord = {
    pin: '482910',
    bookingId: 'booking-1',
    beauticianUserId: 'beautician-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    geoAuditFlag: true,
    distanceMeters: 420,
  };

  const mockParticipant = {
    getBookingForParticipant: jest.fn(async () => booking),
    assertCustomerAccess: jest.fn(),
  };

  const mockPinService = {
    getPin: jest.fn(async () => pinRecord),
    consumePin: jest.fn(async () => pinRecord),
  };

  const mockQrTokenService = {
    verify: jest.fn(),
  };

  const mockPrisma = {
    booking: {
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...booking,
        ...data,
      })),
    },
  };

  const mockSettings = {
    getSettings: jest.fn(async () => ({
      serviceCompletionBufferMinutes: 60,
      arrivalVerificationExpiryMinutes: 15,
      arrivalGeoFenceMeters: 250,
    })),
  };

  const mockNotification = {
    notifyArrivalVerified: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    booking.status = BookingStatus.ARRIVED;
    mockPinService.getPin.mockResolvedValue(pinRecord);
    mockPinService.consumePin.mockResolvedValue(pinRecord);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyArrivalService,
        HomeServiceStatusService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BookingParticipantService, useValue: mockParticipant },
        { provide: ArrivalPinService, useValue: mockPinService },
        { provide: ArrivalQrTokenService, useValue: mockQrTokenService },
        { provide: HomeServiceSettingsService, useValue: mockSettings },
        { provide: BeauticianNotificationService, useValue: mockNotification },
        {
          provide: RealtimePublisherService,
          useValue: { emitBookingStatus: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<VerifyArrivalService>(VerifyArrivalService);
  });

  it('rejects verification without pin or qr token', async () => {
    await expect(
      service.verify('booking-1', 'customer-1', {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid pin without consuming it', async () => {
    await expect(
      service.verify('booking-1', 'customer-1', { pin: '000000' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPinService.consumePin).not.toHaveBeenCalled();
  });

  it('verifies valid pin and starts service timer', async () => {
    const result = await service.verify('booking-1', 'customer-1', {
      pin: '482910',
    });

    expect(mockPinService.consumePin).toHaveBeenCalledWith('booking-1');
    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BookingStatus.IN_PROGRESS,
        }),
      }),
    );
    expect(result.geoAuditFlag).toBe(true);
    expect(result.serviceEndsAt).toBeInstanceOf(Date);
  });

  it('rejects expired pin', async () => {
    mockPinService.getPin.mockResolvedValueOnce(null);

    await expect(
      service.verify('booking-1', 'customer-1', { pin: '482910' }),
    ).rejects.toThrow(BadRequestException);
  });
});