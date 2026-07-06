import { BookingStatus, ReviewStatus } from '@prisma/client';
import { BeauticianStatsService } from './beautician-stats.service';

describe('BeauticianStatsService', () => {
  const beauticianUserId = 'beautician-1';

  const tx = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    review: {
      findMany: jest.fn(),
    },
  };

  let service: BeauticianStatsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BeauticianStatsService({} as never);
    tx.beauticianProfile.findUnique.mockResolvedValue({ id: 'profile-1' });
  });

  it('calculates rating average from approved reviews', async () => {
    tx.review.findMany.mockResolvedValue([
      { rating: 5 },
      { rating: 4 },
      { rating: 3 },
    ]);

    await service.applyCompletedJobStats(tx as never, beauticianUserId, 5000);

    expect(tx.review.findMany).toHaveBeenCalledWith({
      where: {
        status: ReviewStatus.APPROVED,
        booking: {
          assignedBeauticianUserId: beauticianUserId,
          status: BookingStatus.COMPLETED,
        },
      },
      select: { rating: true },
    });
    expect(tx.beauticianProfile.update).toHaveBeenCalledWith({
      where: { userId: beauticianUserId },
      data: {
        totalJobsCompleted: { increment: 1 },
        totalEarnings: { increment: 5000 },
        ratingAverage: 4,
      },
    });
  });

  it('syncs rating average without incrementing job stats', async () => {
    tx.review.findMany.mockResolvedValue([{ rating: 5 }]);

    await service.syncRatingAverage(tx as never, beauticianUserId);

    expect(tx.beauticianProfile.update).toHaveBeenCalledWith({
      where: { userId: beauticianUserId },
      data: { ratingAverage: 5 },
    });
  });
});