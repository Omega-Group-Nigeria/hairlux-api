import { AvailabilityStatus, BookingStatus } from '@prisma/client';
import { OfferManagerService } from './offer-manager.service';

describe('OfferManagerService release after offer', () => {
  let service: OfferManagerService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ reservationCode: 'HLX-TEST' }),
    },
    jobOffer: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockLocationIndex = {
    remove: jest.fn(),
    upsertOnline: jest.fn(),
  };

  const mockMatchingConfig = {
    getConcurrentOffers: jest.fn().mockReturnValue(1),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMatchingConfig.getConcurrentOffers.mockReturnValue(1);
    service = new OfferManagerService(
      mockPrisma as never,
      { transition: jest.fn() } as never,
      { scheduleExpireOffer: jest.fn() } as never,
      { emitJobOffer: jest.fn() } as never,
      mockLocationIndex as never,
      mockMatchingConfig as never,
      { notifyOffer: jest.fn() } as never,
    );
  });

  it('restores ON_JOB when beautician still has an active job after offer ends', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'u1',
      availabilityStatus: AvailabilityStatus.OFFERED,
      currentLat: 6.4,
      currentLng: 3.4,
      lastLocationUpdate: new Date(),
      updatedAt: new Date(),
      assignedServices: [{ serviceId: 's1' }],
    });
    mockPrisma.booking.findFirst.mockResolvedValue({ id: 'active-job' });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    await service.releaseBeauticianToOnline('u1');

    expect(mockPrisma.beauticianProfile.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        availabilityStatus: AvailabilityStatus.OFFERED,
      },
      data: { availabilityStatus: AvailabilityStatus.ON_JOB },
    });
    expect(mockLocationIndex.remove).toHaveBeenCalledWith('u1');
    expect(mockLocationIndex.upsertOnline).not.toHaveBeenCalled();
  });

  it('restores ONLINE and re-indexes when free after offer ends', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'u2',
      availabilityStatus: AvailabilityStatus.OFFERED,
      currentLat: 6.4,
      currentLng: 3.4,
      lastLocationUpdate: new Date(),
      updatedAt: new Date(),
      assignedServices: [{ serviceId: 's1' }],
    });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    await service.releaseBeauticianToOnline('u2');

    expect(mockPrisma.beauticianProfile.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'u2',
        availabilityStatus: AvailabilityStatus.OFFERED,
      },
      data: { availabilityStatus: AvailabilityStatus.ONLINE },
    });
    expect(mockLocationIndex.upsertOnline).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2', lat: 6.4, lng: 3.4 }),
    );
  });

  it('no-ops when profile is not in OFFERED state (race-safe)', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'u3',
      availabilityStatus: AvailabilityStatus.ON_JOB,
      assignedServices: [],
    });

    await service.releaseBeauticianToOnline('u3');

    expect(mockPrisma.beauticianProfile.updateMany).not.toHaveBeenCalled();
    expect(mockLocationIndex.upsertOnline).not.toHaveBeenCalled();
  });

  it('skips geo re-index when OFFERED→ONLINE race loses the update', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      userId: 'u4',
      availabilityStatus: AvailabilityStatus.OFFERED,
      currentLat: 6.4,
      currentLng: 3.4,
      lastLocationUpdate: new Date(),
      updatedAt: new Date(),
      assignedServices: [{ serviceId: 's1' }],
    });
    mockPrisma.booking.findFirst.mockResolvedValue(null);
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 0 });

    await service.releaseBeauticianToOnline('u4');

    expect(mockLocationIndex.upsertOnline).not.toHaveBeenCalled();
  });

  it('createNextOffer skips when concurrent cap is full (default 1)', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb) =>
      cb({
        jobOffer: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: jest.fn(),
          create: jest.fn(),
        },
        beauticianProfile: { update: jest.fn() },
      }),
    );

    const result = await service.createNextOffer({
      bookingId: 'b1',
      matchingAttempt: 1,
      candidate: {
        userId: 'u1',
        profileId: 'p1',
        distanceKm: 1,
        score: 10,
        scoreSnapshot: {},
        isOnJob: false,
      },
      estEarnings: 100,
      offerTtlSeconds: 45,
    });

    expect(result).toBeNull();
    expect(mockLocationIndex.remove).not.toHaveBeenCalled();
  });

  it('createNextOffer allows a second offer when concurrent cap is 2', async () => {
    mockMatchingConfig.getConcurrentOffers.mockReturnValue(2);
    const create = jest.fn().mockResolvedValue({
      id: 'offer-2',
      beauticianUserId: 'u2',
      expiresAt: new Date(),
      estEarningsAtOffer: 100,
      distanceKmAtOffer: 1,
      beautician: {
        id: 'u2',
        email: 'b@example.com',
        firstName: 'B',
        lastName: 'C',
      },
    });

    mockPrisma.$transaction.mockImplementation(async (cb) =>
      cb({
        jobOffer: {
          count: jest.fn().mockResolvedValue(1),
          findFirst: jest.fn().mockResolvedValue(null),
          create,
        },
        beauticianProfile: { update: jest.fn() },
      }),
    );

    const result = await service.createNextOffer({
      bookingId: 'b1',
      matchingAttempt: 1,
      candidate: {
        userId: 'u2',
        profileId: 'p2',
        distanceKm: 1,
        score: 10,
        scoreSnapshot: {},
        isOnJob: false,
      },
      estEarnings: 100,
      offerTtlSeconds: 45,
    });

    expect(create).toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'offer-2', beauticianUserId: 'u2' });
  });
});
