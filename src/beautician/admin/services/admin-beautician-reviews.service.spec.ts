import { NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { AdminBeauticianReviewsService } from './admin-beautician-reviews.service';
import {
  BeauticianReviewSortBy,
  SortOrder,
} from '../../dto/query-beautician-reviews.dto';

describe('AdminBeauticianReviewsService', () => {
  let service: AdminBeauticianReviewsService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
    },
    review: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminBeauticianReviewsService(mockPrisma as never);
  });

  it('lists paginated reviews for a beautician profile sorted by rating', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'user-beautician-1',
    });
    mockPrisma.review.count.mockResolvedValue(1);
    mockPrisma.review.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        rating: 5,
        comment: 'Excellent',
        status: ReviewStatus.APPROVED,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        bookingId: 'booking-1',
        serviceId: 'svc-1',
        user: {
          id: 'cust-1',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
        },
        service: { id: 'svc-1', name: 'Box Braids' },
        booking: {
          id: 'booking-1',
          reservationCode: 'HLX-001',
          bookingDate: new Date('2026-07-01T10:00:00.000Z'),
          serviceCompletedAt: new Date('2026-07-01T12:00:00.000Z'),
          customerRating: 5,
        },
      },
    ]);

    const result = await service.listForProfile('profile-1', {
      page: 1,
      limit: 20,
      sortBy: BeauticianReviewSortBy.RATING,
      sortOrder: SortOrder.DESC,
      ratingMin: 4,
    });

    expect(mockPrisma.review.count).toHaveBeenCalledWith({
      where: {
        booking: { assignedBeauticianUserId: 'user-beautician-1' },
        rating: { gte: 4 },
      },
    });
    expect(mockPrisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          booking: { assignedBeauticianUserId: 'user-beautician-1' },
          rating: { gte: 4 },
        },
        orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        skip: 0,
        take: 20,
      }),
    );
    expect(result.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(result.items[0]).toMatchObject({
      id: 'rev-1',
      rating: 5,
      reservationCode: 'HLX-001',
      customer: { email: 'ada@example.com' },
      service: { name: 'Box Braids' },
    });
  });

  it('throws when beautician profile is missing', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(null);

    await expect(service.listForProfile('missing', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mockPrisma.review.findMany).not.toHaveBeenCalled();
  });
});
