import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { KycVideoService } from './kyc-video.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { R2Service } from '../../../storage/r2.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BeauticianMeCacheService } from '../../services/beautician-me-cache.service';

describe('KycVideoService', () => {
  let service: KycVideoService;

  const mockProfile = {
    id: 'profile-1',
    userId: 'user-1',
    kycStatus: KycStatus.VERIFIED,
    profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
    profileSubmittedAt: new Date('2026-07-18T10:00:00.000Z'),
  };

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockR2 = {
    buildKycVideoKey: jest.fn(),
    isOwnedKycVideoKey: jest.fn(),
    createPresignedUploadUrl: jest.fn(),
    createPresignedDownloadUrl: jest.fn(),
    headObject: jest.fn(),
  };

  const mockNotification = {
    notifyProfileSubmitted: jest.fn(),
  };

  const mockMeCache = {
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycVideoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: R2Service, useValue: mockR2 },
        { provide: BeauticianNotificationService, useValue: mockNotification },
        { provide: BeauticianMeCacheService, useValue: mockMeCache },
      ],
    }).compile();

    service = module.get(KycVideoService);
  });

  it('rejects video request when profile has not been submitted', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      ...mockProfile,
      profileStatus: ProfileReviewStatus.NOT_SUBMITTED,
    });

    await expect(
      service.requestUpload('user-1', { contentType: 'video/mp4' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects video request when KYC is not verified', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({
      ...mockProfile,
      kycStatus: KycStatus.PENDING,
    });

    await expect(
      service.requestUpload('user-1', { contentType: 'video/mp4' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns presigned upload URL when AWAITING_VIDEO', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockR2.buildKycVideoKey.mockReturnValue(
      'kyc-videos/user-1/abc.mp4',
    );
    mockR2.createPresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://r2.example/upload',
      fileKey: 'kyc-videos/user-1/abc.mp4',
      expiresIn: 600,
      expiresAt: '2026-07-18T10:10:00.000Z',
      maxSizeBytes: 100 * 1024 * 1024,
      contentType: 'video/mp4',
    });

    const result = await service.requestUpload('user-1', {
      contentType: 'video/mp4',
    });

    expect(result.uploadUrl).toContain('https://');
    expect(result.fileKey).toBe('kyc-videos/user-1/abc.mp4');
  });

  it('confirms upload, stores key, and moves to PENDING_REVIEW', async () => {
    mockPrisma.beauticianProfile.findUnique
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce({
        ...mockProfile,
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        kycVideoKey: 'kyc-videos/user-1/abc.mp4',
        updatedAt: new Date(),
        user: {
          id: 'user-1',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
        },
      });
    mockR2.isOwnedKycVideoKey.mockReturnValue(true);
    mockR2.headObject.mockResolvedValue({
      contentLength: 5_000_000,
      contentType: 'video/mp4',
    });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.confirmUpload('user-1', {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 5_000_000,
    });

    expect(result.profileStatus).toBe(ProfileReviewStatus.PENDING_REVIEW);
    expect(mockNotification.notifyProfileSubmitted).toHaveBeenCalled();
    expect(mockMeCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('rejects confirm when file key is not owned by user', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockR2.isOwnedKycVideoKey.mockReturnValue(false);

    await expect(
      service.confirmUpload('user-1', {
        fileKey: 'kyc-videos/other-user/abc.mp4',
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects concurrent confirm when status already left AWAITING_VIDEO', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockR2.isOwnedKycVideoKey.mockReturnValue(true);
    mockR2.headObject.mockResolvedValue({
      contentLength: 5_000_000,
      contentType: 'video/mp4',
    });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.confirmUpload('user-1', {
        fileKey: 'kyc-videos/user-1/abc.mp4',
        contentType: 'video/mp4',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
