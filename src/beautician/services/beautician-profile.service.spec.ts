import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { BeauticianProfileService } from './beautician-profile.service';
import { ProfileRejectScope } from '../dto/admin-beautician.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { R2Service } from '../../storage/r2.service';
import { BeauticianNotificationService } from '../notification/services/beautician-notification.service';
import { OnboardingPushNotifier } from '../../notifications/onboarding/onboarding-push.notifier';
import { BeauticianMeCacheService } from './beautician-me-cache.service';

describe('BeauticianProfileService', () => {
  let service: BeauticianProfileService;

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    kycStatus: KycStatus.VERIFIED,
    profileStatus: ProfileReviewStatus.NOT_SUBMITTED,
    bio: 'Experienced stylist with 6 years in braids and makeup.',
    profilePhotoUrl: 'https://cdn.example.com/photo.webp',
    specialties: ['Box Braids'],
    yearsOfExperience: 6,
    certifications: [],
    kycVideoKey: null as string | null,
  };

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockCloudinary = { uploadImage: jest.fn() };
  const mockNotification = {
    notifyProfileSubmitted: jest.fn(),
    notifyProfileReviewResult: jest.fn(),
  };

  const mockOnboardingPush = {
    notifyProfileReview: jest.fn(),
  };

  const mockMeCache = {
    invalidate: jest.fn(),
  };

  const mockR2 = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeauticianProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: BeauticianNotificationService, useValue: mockNotification },
        { provide: BeauticianMeCacheService, useValue: mockMeCache },
        { provide: R2Service, useValue: mockR2 },
        { provide: OnboardingPushNotifier, useValue: mockOnboardingPush },
      ],
    }).compile();

    service = module.get<BeauticianProfileService>(BeauticianProfileService);
  });

  it('locks profile updates while pending review', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      ...mockProfile,
      profileStatus: ProfileReviewStatus.PENDING_REVIEW,
    });

    await expect(
      service.updateProfile('user-1', { bio: 'Updated bio text here.' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('locks profile updates while awaiting video', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      ...mockProfile,
      profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
    });

    await expect(
      service.updateProfile('user-1', { bio: 'Updated bio text here.' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('submits profile and advances to AWAITING_VIDEO (not full review yet)', async () => {
    mockPrisma.beauticianProfile.findUnique
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce({
        profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
        profileSubmittedAt: new Date(),
      });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.submitForReview('user-1');

    expect(result.profileStatus).toBe(ProfileReviewStatus.AWAITING_VIDEO);
    expect(result.nextStep).toBe('VIDEO_SUBMISSION');
    expect(mockNotification.notifyProfileSubmitted).not.toHaveBeenCalled();
    expect(mockMeCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('FULL reject sets REJECTED, clears video key, and deletes R2 object', async () => {
    mockPrisma.beauticianProfile.findUnique
      .mockResolvedValueOnce({
        ...mockProfile,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        kycVideoKey: 'kyc-videos/user-1/old.mp4',
      })
      .mockResolvedValueOnce({
        ...mockProfile,
        userId: 'user-1',
        profileStatus: ProfileReviewStatus.REJECTED,
        kycVideoKey: null,
        user: {
          id: 'user-1',
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Okafor',
        },
      });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.rejectProfile(
      'profile-1',
      'admin-1',
      'Incomplete portfolio',
    );

    expect(result.profileStatus).toBe(ProfileReviewStatus.REJECTED);
    expect(mockPrisma.beauticianProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileStatus: ProfileReviewStatus.REJECTED,
          kycVideoKey: null,
        }),
      }),
    );
    expect(mockR2.deleteObject).toHaveBeenCalledWith(
      'kyc-videos/user-1/old.mp4',
    );
    expect(mockNotification.notifyProfileReviewResult).toHaveBeenCalledWith(
      expect.anything(),
      'REJECTED',
      'Incomplete portfolio',
    );
    expect(mockOnboardingPush.notifyProfileReview).toHaveBeenCalledWith({
      beauticianUserId: 'user-1',
      outcome: 'REJECTED',
      notes: 'Incomplete portfolio',
    });
  });

  it('VIDEO_ONLY reject sets AWAITING_VIDEO and deletes R2 object', async () => {
    mockPrisma.beauticianProfile.findUnique
      .mockResolvedValueOnce({
        ...mockProfile,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        kycVideoKey: 'kyc-videos/user-1/old.mp4',
      })
      .mockResolvedValueOnce({
        ...mockProfile,
        userId: 'user-1',
        profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
        kycVideoKey: null,
        user: {
          id: 'user-1',
          email: 'ada@example.com',
          firstName: 'Ada',
          lastName: 'Okafor',
        },
      });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.rejectProfile(
      'profile-1',
      'admin-1',
      'Video too dark',
      undefined,
      ProfileRejectScope.VIDEO_ONLY,
    );

    expect(result.profileStatus).toBe(ProfileReviewStatus.AWAITING_VIDEO);
    expect(mockPrisma.beauticianProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
          kycVideoKey: null,
        }),
      }),
    );
    expect(mockR2.deleteObject).toHaveBeenCalledWith(
      'kyc-videos/user-1/old.mp4',
    );
    expect(mockNotification.notifyProfileReviewResult).toHaveBeenCalledWith(
      expect.anything(),
      'VIDEO_ONLY',
      'Video too dark',
    );
    expect(mockOnboardingPush.notifyProfileReview).toHaveBeenCalledWith({
      beauticianUserId: 'user-1',
      outcome: 'VIDEO_ONLY',
      notes: 'Video too dark',
    });
    expect(mockMeCache.invalidate).toHaveBeenCalledWith('user-1');
  });
});