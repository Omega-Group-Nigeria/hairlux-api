import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { BeauticianReadService } from './beautician-read.service';
import { BeauticianMeCacheService } from './beautician-me-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';

describe('BeauticianReadService', () => {
  let service: BeauticianReadService;

  const mockPrisma = {
    beauticianProfile: { findUnique: jest.fn() },
  };

  const mockWalletService = {
    getBalance: jest.fn(),
  };

  const mockMeCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  const fullProfile = {
    id: 'profile-1',
    bio: 'Hair stylist',
    profilePhotoUrl: 'https://example.com/photo.jpg',
    specialties: ['Braids'],
    yearsOfExperience: 5,
    maxTravelRadiusKm: 15,
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
    _count: { assignedServices: 2 },
    availabilityStatus: AvailabilityStatus.OFFLINE,
    currentLat: 6.45,
    currentLng: 3.39,
    lastLocationUpdate: new Date('2026-07-03T10:00:00.000Z'),
    kycStatus: KycStatus.VERIFIED,
    profileStatus: ProfileReviewStatus.APPROVED,
    isActive: true,
    dispatchSuspended: false,
    dispatchSuspendedUntil: null,
    dispatchSuspensionReason: null,
    ratingAverage: 4.8,
    totalJobsCompleted: 12,
    totalEarnings: 150000,
  };

  const volatileProfile = {
    availabilityStatus: fullProfile.availabilityStatus,
    currentLat: fullProfile.currentLat,
    currentLng: fullProfile.currentLng,
    lastLocationUpdate: fullProfile.lastLocationUpdate,
    kycStatus: fullProfile.kycStatus,
    profileStatus: fullProfile.profileStatus,
    isActive: fullProfile.isActive,
    dispatchSuspended: fullProfile.dispatchSuspended,
    dispatchSuspendedUntil: fullProfile.dispatchSuspendedUntil,
    dispatchSuspensionReason: fullProfile.dispatchSuspensionReason,
    ratingAverage: fullProfile.ratingAverage,
    totalJobsCompleted: fullProfile.totalJobsCompleted,
    totalEarnings: fullProfile.totalEarnings,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeauticianReadService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
        { provide: BeauticianMeCacheService, useValue: mockMeCache },
      ],
    }).compile();

    service = module.get<BeauticianReadService>(BeauticianReadService);
  });

  it('returns a trimmed profile without sensitive fields', async () => {
    mockMeCache.get.mockResolvedValue(null);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(fullProfile);
    mockWalletService.getBalance.mockResolvedValue({
      balance: 5000,
      currency: 'NGN',
    });

    const result = await service.getMyProfile('user-1');

    expect(mockPrisma.beauticianProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.beauticianProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        select: expect.objectContaining({
          bio: true,
          user: expect.any(Object),
          availabilityStatus: true,
        }),
      }),
    );
    expect(result).toEqual({
      id: 'profile-1',
      bio: 'Hair stylist',
      profilePhotoUrl: 'https://example.com/photo.jpg',
      specialties: ['Braids'],
      yearsOfExperience: 5,
      maxTravelRadiusKm: 15,
      assignedServiceCount: 2,
      availabilityStatus: AvailabilityStatus.OFFLINE,
      currentLat: 6.45,
      currentLng: 3.39,
      lastLocationUpdate: fullProfile.lastLocationUpdate,
      kycStatus: KycStatus.VERIFIED,
      profileStatus: ProfileReviewStatus.APPROVED,
      isActive: true,
      dispatchSuspended: false,
      dispatchSuspendedUntil: null,
      dispatchSuspensionReason: null,
      ratingAverage: 4.8,
      totalJobsCompleted: 12,
      totalEarnings: 150000,
      user: fullProfile.user,
      walletBalance: 5000,
      isFullyVerified: true,
      canGoOnline: true,
    });
    expect(result).not.toHaveProperty('certifications');
    expect(result).not.toHaveProperty('qoreIdCustomerId');
    expect(result).not.toHaveProperty('payoutBankCode');
    expect(mockMeCache.set).toHaveBeenCalled();
  });

  it('uses cached stable profile with a single volatile query', async () => {
    mockMeCache.get.mockResolvedValue({
      id: 'profile-1',
      bio: 'Hair stylist',
      profilePhotoUrl: 'https://example.com/photo.jpg',
      specialties: ['Braids'],
      yearsOfExperience: 5,
      maxTravelRadiusKm: 15,
      assignedServiceCount: 2,
      user: fullProfile.user,
    });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(volatileProfile);
    mockWalletService.getBalance.mockResolvedValue({
      balance: 5000,
      currency: 'NGN',
    });

    await service.getMyProfile('user-1');

    expect(mockPrisma.beauticianProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.beauticianProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ user: expect.anything() }),
      }),
    );
    expect(mockMeCache.set).not.toHaveBeenCalled();
  });

  it('loads wallet balance in parallel with cache lookup', async () => {
    mockMeCache.get.mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(null), 20);
        }),
    );
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(fullProfile);
    mockWalletService.getBalance.mockImplementation(
      async () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ balance: 5000, currency: 'NGN' }),
            20,
          );
        }),
    );

    await service.getMyProfile('user-1');

    expect(mockWalletService.getBalance).toHaveBeenCalledWith('user-1');
    expect(mockMeCache.get).toHaveBeenCalledWith('user-1');
  });

  it('throws when beautician profile does not exist', async () => {
    mockMeCache.get.mockResolvedValue(null);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(null);
    mockWalletService.getBalance.mockResolvedValue({
      balance: 0,
      currency: 'NGN',
    });

    await expect(service.getMyProfile('user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});