import { BookingStatus } from '@prisma/client';
import { JobQueryService } from './job-query.service';
import { JobPresentationService } from './job-presentation.service';

describe('JobQueryService', () => {
  let service: JobQueryService;

  const mockPresentation = {
    bookingInclude: jest.fn(() => ({
      address: true,
      user: { select: { id: true, firstName: true, lastName: true, phone: true } },
    })),
    buildHistoryResponse: jest.fn((booking, meta) => ({
      booking: { id: booking.id, status: booking.status },
      earningsAmount: meta.earningsAmount,
    })),
    buildAcceptedResponse: jest.fn(),
    buildAvailableOffer: jest.fn(),
  };

  const mockPrisma = {
    beauticianProfile: { findUnique: jest.fn() },
    jobOffer: { findMany: jest.fn() },
    booking: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
    },
  };

  const mockEarningsResolver = {
    resolveForActiveBookings: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new JobQueryService(
      mockPrisma as never,
      mockPresentation as unknown as JobPresentationService,
      mockEarningsResolver as never,
    );
  });

  describe('listHistory', () => {
    const completedBooking = {
      id: 'booking-completed',
      status: BookingStatus.COMPLETED,
      services: [],
      totalAmount: 45000,
      bookingDate: new Date('2026-06-20T00:00:00.000Z'),
      bookingTime: '10:00',
      reservationCode: 'HLX-123',
      cancelReason: null,
      customerRating: 5,
      customerReview: 'Great service',
      serviceCompletedAt: new Date('2026-06-20T12:30:00.000Z'),
      updatedAt: new Date('2026-06-20T12:35:00.000Z'),
      address: {
        fullAddress: '12 Admiralty Way, Lekki',
        city: 'Lekki',
        state: 'Lagos',
      },
      user: { firstName: 'Amara', lastName: 'Okafor' },
    };

    const cancelledBooking = {
      ...completedBooking,
      id: 'booking-cancelled',
      status: BookingStatus.CANCELLED,
      customerRating: null,
      customerReview: null,
      serviceCompletedAt: null,
      cancelReason: 'Customer unavailable',
    };

    const awaitingConfirmBooking = {
      ...completedBooking,
      id: 'booking-awaiting',
      status: BookingStatus.AWAITING_CUSTOMER_CONFIRM,
      customerRating: null,
      customerReview: null,
      serviceCompletedAt: new Date('2026-06-21T11:00:00.000Z'),
      cancelReason: null,
    };

    const assignedStatuses = [
      BookingStatus.ASSIGNED,
      BookingStatus.EN_ROUTE,
      BookingStatus.ARRIVED,
      BookingStatus.ARRIVED_VERIFIED,
      BookingStatus.IN_PROGRESS,
      BookingStatus.AWAITING_CUSTOMER_CONFIRM,
      BookingStatus.COMPLETED,
      BookingStatus.CANCELLED,
    ];

    it('returns paginated assigned jobs for the beautician', async () => {
      mockPrisma.booking.findMany.mockResolvedValueOnce([
        completedBooking,
        cancelledBooking,
      ]);
      mockPrisma.booking.count.mockResolvedValueOnce(2);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([
        {
          reference: 'SVC-EARN-booking-completed',
          amount: 31500,
        },
      ]);

      const result = await service.listHistory('beautician-1', {
        page: 1,
        limit: 20,
      });

      expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            assignedBeauticianUserId: 'beautician-1',
            status: { in: assignedStatuses },
          },
          skip: 0,
          take: 20,
        }),
      );
      expect(result.items).toHaveLength(2);
      expect(result.items[0].earningsAmount).toBe(31500);
      expect(result.items[1].earningsAmount).toBeNull();
      expect(result.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      });
    });

    it('includes awaiting customer confirmation jobs in history', async () => {
      mockPrisma.booking.findMany.mockResolvedValueOnce([awaitingConfirmBooking]);
      mockPrisma.booking.count.mockResolvedValueOnce(1);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

      const result = await service.listHistory('beautician-1', {
        page: 1,
        limit: 20,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].booking.status).toBe(
        BookingStatus.AWAITING_CUSTOMER_CONFIRM,
      );
      expect(result.items[0].earningsAmount).toBeNull();
    });

    it('filters by a single assigned job status when provided', async () => {
      mockPrisma.booking.findMany.mockResolvedValueOnce([completedBooking]);
      mockPrisma.booking.count.mockResolvedValueOnce(1);
      mockPrisma.transaction.findMany.mockResolvedValueOnce([]);

      await service.listHistory('beautician-1', {
        page: 2,
        limit: 10,
        status: BookingStatus.COMPLETED,
      });

      expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            assignedBeauticianUserId: 'beautician-1',
            status: { in: [BookingStatus.COMPLETED] },
          },
          skip: 10,
          take: 10,
        }),
      );
    });
  });
});