import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AvailabilityStatus,
  BookingStatus,
  JobOfferStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AssignmentLockService } from './assignment-lock.service';
import { JobAcceptService } from './job-accept.service';
import { JobPresentationService } from './job-presentation.service';
import { RealtimePublisherService } from '../../realtime/realtime-publisher.service';

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
      },
    ],
  ]);

  let assignedBeauticianUserId: string | null = null;
  let bookingStatus = BookingStatus.PENDING_ASSIGNMENT;

  const mockPrisma = {
    booking: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (
          where.assignedBeauticianUserId &&
          where.status === BookingStatus.ASSIGNED
        ) {
          return null;
        }
        return null;
      }),
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
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        for (const [userId, offer] of offers.entries()) {
          if (offer.id === where.id) {
            offers.set(userId, {
              ...offer,
              status: data.status as JobOfferStatus,
            });
          }
        }
        return { id: where.id };
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { bookingId: string; id: { not: string } };
          data: { status: JobOfferStatus };
        }) => {
          for (const [userId, offer] of offers.entries()) {
            if (
              offer.bookingId === where.bookingId &&
              offer.id !== where.id.not
            ) {
              offers.set(userId, { ...offer, status: data.status });
            }
          }
          return { count: 1 };
        },
      ),
    },
    beauticianProfile: {
      update: jest.fn(async () => ({
        availabilityStatus: AvailabilityStatus.ON_JOB,
      })),
    },
    $transaction: jest.fn(async (callback: (tx: typeof mockPrisma) => unknown) =>
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
          provide: RealtimePublisherService,
          useValue: { emitBookingStatus: jest.fn() },
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