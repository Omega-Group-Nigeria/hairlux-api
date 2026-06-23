import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { BeauticianReadService } from './beautician-read.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('BeauticianReadService', () => {
  let service: BeauticianReadService;

  const mockPrisma = {
    beauticianProfile: { findUnique: jest.fn() },
    wallet: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeauticianReadService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BeauticianReadService>(BeauticianReadService);
  });

  it('returns profile with verification flags', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      id: 'profile-1',
      userId: 'user-1',
      kycStatus: KycStatus.VERIFIED,
      profileStatus: ProfileReviewStatus.APPROVED,
      availabilityStatus: AvailabilityStatus.OFFLINE,
      isActive: true,
      serviceRadiusKm: 20,
      ratingAverage: 0,
      totalEarnings: 0,
      totalJobsCompleted: 0,
      specialties: [],
      certifications: [],
      user: {
        id: 'user-1',
        firstName: 'Ada',
        lastName: 'Okafor',
        email: 'ada@example.com',
        phone: '+2348012345678',
        role: 'BEAUTICIAN',
        status: 'ACTIVE',
        emailVerified: true,
      },
      _count: { assignedServices: 0 },
    });
    mockPrisma.wallet.findUnique.mockResolvedValue({ balance: 5000 });

    const result = await service.getMyProfile('user-1');

    expect(result.isFullyVerified).toBe(true);
    expect(result.canGoOnline).toBe(true);
    expect(result.walletBalance).toBe(5000);
  });

  it('throws when beautician profile does not exist', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(null);

    await expect(service.getMyProfile('user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});