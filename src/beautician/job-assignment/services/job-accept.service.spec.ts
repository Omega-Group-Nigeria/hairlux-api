import { ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bull';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../comms/services/comms-session.service', () => ({
  CommsSessionService: class CommsSessionService {},
}));
jest.mock('../../../comms/services/comms-realtime.service', () => ({
  CommsRealtimeService: class CommsRealtimeService {},
}));
jest.mock('../../matching/services/dispatch-state.service', () => ({
  DispatchStateService: class DispatchStateService {},
}));
jest.mock('../../matching/services/beautician-location-index.service', () => ({
  BeauticianLocationIndexService: class BeauticianLocationIndexService {},
}));

import { HOME_SERVICE_MATCHING_QUEUE } from '../../home-service-booking/home-service-matching-queue.constants';
import {
  AvailabilityStatus,
  BookingStatus,
  JobOfferStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AssignmentLockService } from './assignment-lock.service';
import { JobAcceptService } from './job-accept.service';
import { JobPresentationService } from './job-presentation.service';
import { JobEarningsResolverService } from './job-earnings-resolver.service';
import { HomeServiceSettingsService } from '../../services/home-service-settings.service';
import { ServiceCommissionRateService } from '../../payout/services/service-commission-rate.service';
import { BeauticianCommissionRateService } from '../../payout/services/beautician-commission-rate.service';
import { CommsRealtimeService } from '../../../comms/services/comms-realtime.service';
import { DispatchStateService } from '../../matching/services/dispatch-state.service';
import { BeauticianLocationIndexService } from '../../matching/services/beautician-location-index.service';
import { CommsSessionService } from '../../../comms/services/comms-session.service';
import { BookingPushNotifier } from '../../../notifications/booking/booking-push.notifier';
import { JobPushNotifier } from '../../../notifications/job/job-push.notifier';

describe('JobAcceptService', () => {
  let service: JobAcceptService;

  const bookingId = 'booking-1';
  const winnerId = 'beautician-winner';
  const loserId = 'beautician-loser';
  const offerWinnerId = 'offer-winner';
  const offerLoserId = 'offer-loser';

  const lockOwner = new Map<string, string>();

  const mockLockService = {
    acquire: jest.fn(async (id: string, ownerId: string) => {
      if (lockOwner.has(id)) {
        return false;
      }
      lockOwner.set(id, ownerId);
      return true;
    }),
    release: jest.fn(async (id: string) => {
      lockOwner.delete(id);
    }),
  };

  const bookingRecord = {
    id: bookingId,
    status: BookingStatus.PENDING_ASSIGNMENT,
    assignedBeauticianUserId: null,
    bookingType: 'HOME_SERVICE' as const,
    bookingDate: new Date('2026-06-21T10:00:00.000Z'),
    bookingTime: '10:00',
    services: [],
    totalAmount: 150,
    address: {
      fullAddress: '12 Admiralty Way, Lagos',
      city: 'Lagos',
      state: 'Lagos',
    },
  };

  const offers = new Map([
    [
      winnerId,
      {
        id: offerWinnerId,
        bookingId,
        beauticianUserId: winnerId,
        status: JobOfferStatus.OFFERED,
        expiresAt: new Date(Date.now() + 60_000),
        estEarningsAtOffer: 105,
      },
    ],
    [
      loserId,
      {
        id: offerLoserId,
        bookingId,
        beauticianUserId: loserId,
        status: JobOfferStatus.OFFERED,
        expiresAt: new Date(Date.now() + 60_000),
        estEarningsAtOffer: 105,
      },
    ],
  ]);

  let assignedBeauticianUserId: string | null = null;
  let bookingStatus = BookingStatus.PENDING_ASSIGNMENT;

  const mockPrisma = {
    booking: {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if (
            where.assignedBeauticianUserId &&
            where.status === BookingStatus.ASSIGNED
          ) {
            return null;
          }
          return null;
        },
      ),
      findUnique: jest.fn(async () => ({
        ...bookingRecord,
        status: bookingStatus,
        assignedBeauticianUserId,
      })),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        assignedBeauticianUserId = String(data.assignedBeauticianUserId);
        bookingStatus = data.status as BookingStatus;
        return {
          ...bookingRecord,
          status: bookingStatus,
          assignedBeauticianUserId,
        };
      }),
    },
    jobOffer: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { beauticianUserId: string; status: JobOfferStatus };
        }) => {
          if (bookingStatus !== BookingStatus.PENDING_ASSIGNMENT) {
            return null;
          }
          return offers.get(where.beauticianUserId) ?? null;
        },
      ),
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: {
            bookingId: string;
            id?: { not: string };
            status?: JobOfferStatus;
            expiresAt?: { gt: Date };
          };
        }) => {
          const notId =
            where.id && typeof where.id === 'object' && 'not' in where.id
              ? where.id.not
              : undefined;
          return Array.from(offers.values())
            .filter(
              (offer) =>
                offer.bookingId === where.bookingId &&
                offer.status === (where.status ?? JobOfferStatus.OFFERED) &&
                offer.id !== notId &&
                offer.expiresAt > new Date(),
            )
            .map((offer) => ({ beauticianUserId: offer.beauticianUserId }));
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          for (const [userId, offer] of offers.entries()) {
            if (offer.id === where.id) {
              offers.set(userId, {
                ...offer,
                status: data.status as JobOfferStatus,
              });
            }
          }
          return { id: where.id };
        },
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id?: string;
            bookingId?: string;
            status?: JobOfferStatus;
            expiresAt?: { gt: Date };
          };
          data: { status: JobOfferStatus };
        }) => {
          let count = 0;

          for (const [userId, offer] of offers.entries()) {
            const isAccept =
              where.id === offer.id && where.status === JobOfferStatus.OFFERED;
            const isExpireOthers =
              where.bookingId === offer.bookingId &&
              typeof where.id === 'object' &&
              where.id !== null &&
              'not' in where.id &&
              offer.id !== where.id.not &&
              where.status === JobOfferStatus.OFFERED;

            if (isAccept || isExpireOthers) {
              offers.set(userId, {
                ...offer,
                status: data.status as JobOfferStatus,
              });
              count += 1;
            }
          }

          return { count };
        },
      ),
    },
    beauticianProfile: {
      findUnique: jest.fn(async () => ({ commissionRateOverride: null })),
      update: jest.fn(async () => ({
        availabilityStatus: AvailabilityStatus.ON_JOB,
      })),
    },
    $transaction: jest.fn(
      async (callback: (tx: typeof mockPrisma) => unknown) =>
        callback(mockPrisma),
    ),
  };

  const mockPresentation = {
    bookingInclude: jest.fn(() => ({})),
    buildAcceptedResponse: jest.fn((booking) => ({
      bookingId: booking.id,
      status: booking.status,
      assignedBeauticianUserId: booking.assignedBeauticianUserId,
    })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    lockOwner.clear();
    assignedBeauticianUserId = null;
    bookingStatus = BookingStatus.PENDING_ASSIGNMENT;
    offers.set(winnerId, {
      id: offerWinnerId,
      bookingId,
      beauticianUserId: winnerId,
      status: JobOfferStatus.OFFERED,
      expiresAt: new Date(Date.now() + 60_000),
    });
    offers.set(loserId, {
      id: offerLoserId,
      bookingId,
      beauticianUserId: loserId,
      status: JobOfferStatus.OFFERED,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobAcceptService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssignmentLockService, useValue: mockLockService },
        { provide: JobPresentationService, useValue: mockPresentation },
        {
          provide: CommsRealtimeService,
          useValue: {
            emitBookingStatus: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: getQueueToken(HOME_SERVICE_MATCHING_QUEUE),
          useValue: { getJob: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: DispatchStateService,
          useValue: {
            recordEvent: jest.fn().mockResolvedValue({ applied: true }),
          },
        },
        {
          provide: JobEarningsResolverService,
          useValue: {
            resolveForActiveBookings: jest.fn(),
            resolveFromOfferSnapshot: jest.fn(() => ({
              payoutAmount: 105,
              commissionRate: 0.7,
            })),
          },
        },
        {
          provide: HomeServiceSettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({ commissionRate: 0.7 }),
          },
        },
        {
          provide: ServiceCommissionRateService,
          useValue: {
            getRateMapForBookingServices: jest
              .fn()
              .mockResolvedValue(new Map()),
          },
        },
        {
          provide: BeauticianCommissionRateService,
          useValue: {
            getRateMapForBeauticianIds: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: BeauticianLocationIndexService,
          useValue: { remove: jest.fn() },
        },
        {
          provide: CommsSessionService,
          useValue: {
            openForBookingSafely: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: BookingPushNotifier,
          useValue: { notifyBeauticianAssigned: jest.fn() },
        },
        {
          provide: JobPushNotifier,
          useValue: { notifyOfferTaken: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<JobAcceptService>(JobAcceptService);
  });

  it('allows only the first concurrent accept to succeed', async () => {
    const [winnerResult, loserResult] = await Promise.allSettled([
      service.accept(bookingId, winnerId),
      service.accept(bookingId, loserId),
    ]);

    expect(winnerResult.status).toBe('fulfilled');
    expect(loserResult.status).toBe('rejected');
    if (loserResult.status === 'rejected') {
      expect(loserResult.reason).toBeInstanceOf(ConflictException);
    }

    expect(assignedBeauticianUserId).toBe(winnerId);
    expect(bookingStatus).toBe(BookingStatus.ASSIGNED);
    expect(offers.get(winnerId)?.status).toBe(JobOfferStatus.ACCEPTED);
    expect(offers.get(loserId)?.status).toBe(JobOfferStatus.EXPIRED);
  });
});
