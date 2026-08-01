import { Test, TestingModule } from '@nestjs/testing';
import { JobOfferStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OfferExclusionService } from './offer-exclusion.service';

describe('OfferExclusionService', () => {
  let service: OfferExclusionService;

  const bookingId = 'booking-1';
  const offers = [
    {
      beauticianUserId: 'beautician-b',
      status: JobOfferStatus.EXPIRED,
      expiresAt: new Date(Date.now() - 60_000),
      respondedAt: new Date(),
    },
    {
      beauticianUserId: 'beautician-c',
      status: JobOfferStatus.DECLINED,
      expiresAt: new Date(Date.now() + 60_000),
      respondedAt: new Date(),
    },
    {
      beauticianUserId: 'beautician-d',
      status: JobOfferStatus.OFFERED,
      expiresAt: new Date(Date.now() + 60_000),
      respondedAt: null,
    },
    {
      beauticianUserId: 'beautician-e',
      status: JobOfferStatus.ACCEPTED,
      expiresAt: new Date(Date.now() + 60_000),
      respondedAt: new Date(),
    },
  ];

  const mockPrisma = {
    jobOffer: {
      findMany: jest.fn(
        async ({
          where,
        }: {
          where: { status?: JobOfferStatus | { in?: JobOfferStatus[] }; bookingId: string };
        }) => {
          const statuses = Array.isArray(where.status?.in)
            ? where.status.in
            : where.status
              ? [where.status]
              : [];

          return offers.filter((offer) => statuses.includes(offer.status));
        },
      ),
      findFirst: jest.fn(async () => ({
        beauticianUserId: 'beautician-b',
      })),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferExclusionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<OfferExclusionService>(OfferExclusionService);
  });

  it('permanently excludes declined and accepted beauticians only', async () => {
    await expect(service.getExcludedBeauticianIds(bookingId)).resolves.toEqual(
      expect.arrayContaining([
        'beautician-c',
        'beautician-d',
        'beautician-e',
      ]),
    );

    const excluded = await service.getExcludedBeauticianIds(bookingId);
    expect(excluded).not.toContain('beautician-b');
  });

  it('does not treat expired offers as excluded', async () => {
    const excluded = await service.getExcludedBeauticianIds(bookingId);
    expect(excluded).not.toContain('beautician-b');
  });

  it('returns declined beauticians for decline-only exclusion checks', async () => {
    await expect(service.getDeclinedBeauticianIds(bookingId)).resolves.toEqual([
      'beautician-c',
    ]);
  });

  it('returns the most recent offer recipient for rotation', async () => {
    await expect(
      service.getLastOfferedBeauticianUserId(bookingId),
    ).resolves.toBe('beautician-b');
  });
});