import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { KycVideoMultipartService } from './kyc-video-multipart.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { R2Service } from '../../../storage/r2.service';
import { RedisService } from '../../../redis/redis.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { BeauticianMeCacheService } from '../../services/beautician-me-cache.service';

describe('KycVideoMultipartService', () => {
  let service: KycVideoMultipartService;

  const mockProfile = {
    userId: 'user-1',
    kycStatus: KycStatus.VERIFIED,
    profileStatus: ProfileReviewStatus.AWAITING_VIDEO,
    profileSubmittedAt: new Date('2026-07-18T10:00:00Z'),
    kycVideoKey: null,
  };

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockR2 = {
    buildKycVideoKey: jest.fn(),
    isOwnedKycVideoKey: jest.fn(),
    createMultipartUpload: jest.fn(),
    createPresignedPartUrls: jest.fn(),
    completeMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    abortMultipartUpload: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockNotification = { notifyProfileSubmitted: jest.fn().mockResolvedValue(undefined) };
  const mockCache = { invalidate: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycVideoMultipartService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: R2Service, useValue: mockR2 },
        { provide: RedisService, useValue: mockRedis },
        { provide: BeauticianNotificationService, useValue: mockNotification },
        { provide: BeauticianMeCacheService, useValue: mockCache },
      ],
    }).compile();
    service = module.get(KycVideoMultipartService);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockR2.buildKycVideoKey.mockReturnValue('kyc-videos/user-1/abc.mp4');
    mockR2.isOwnedKycVideoKey.mockReturnValue(true);
    mockR2.createMultipartUpload.mockResolvedValue('r2-upload-123');
    mockR2.createPresignedPartUrls.mockResolvedValue([
      { partNumber: 1, uploadUrl: 'https://r2/part1', expiresIn: 1200, expiresAt: new Date().toISOString() },
      { partNumber: 2, uploadUrl: 'https://r2/part2', expiresIn: 1200, expiresAt: new Date().toISOString() },
    ]);
    mockR2.headObject.mockResolvedValue({ contentLength: 7_000_000, contentType: 'video/mp4' });
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockR2.isOwnedKycVideoKey.mockReturnValue(true);
    mockRedis.set.mockResolvedValue(undefined);
    mockRedis.get.mockResolvedValue(null);
  });

  it('creates multipart session with correct partCount', async () => {
    const res = await service.createSession('user-1', 'video/mp4', 7_000_000);
    expect(res.partSize).toBe(5 * 1024 * 1024);
    expect(res.partCount).toBe(2);
    expect(res.uploadId).toBe('r2-upload-123');
    expect(mockR2.createMultipartUpload).toHaveBeenCalledWith('kyc-videos/user-1/abc.mp4', 'video/mp4');
    expect(mockRedis.set).toHaveBeenCalled();
  });

  it('rejects when file exceeds 100MB', async () => {
    await expect(service.createSession('user-1', 'video/mp4', 101 * 1024 * 1024)).rejects.toThrow(BadRequestException);
  });

  it('rejects when profile not awaiting video', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({ ...mockProfile, profileStatus: ProfileReviewStatus.NOT_SUBMITTED });
    await expect(service.createSession('user-1', 'video/mp4', 5_000_000)).rejects.toThrow(BadRequestException);
  });

  it('refreshes part URLs and extends TTL', async () => {
    const session = {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      r2UploadId: 'r2-upload-123',
      userId: 'user-1',
      contentType: 'video/mp4',
      partSize: 5 * 1024 * 1024,
      partCount: 2,
      expiresAt: new Date(Date.now() + 100000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockRedis.get.mockResolvedValue(session);
    const res = await service.refreshPartUrls('user-1', 'r2-upload-123');
    expect(res.fileKey).toBe(session.fileKey);
    expect(mockR2.createPresignedPartUrls).toHaveBeenCalledWith(session.fileKey, session.r2UploadId, 2);
  });

  it('throws when refresh session not found', async () => {
    mockRedis.get.mockResolvedValue(null);
    await expect(service.refreshPartUrls('user-1', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('completes multipart, verifies object and moves to PENDING_REVIEW', async () => {
    const session = {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      r2UploadId: 'r2-upload-123',
      userId: 'user-1',
      contentType: 'video/mp4',
      partSize: 5 * 1024 * 1024,
      partCount: 2,
      expiresAt: new Date(Date.now() + 100000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockRedis.get.mockResolvedValue(session);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValueOnce(mockProfile).mockResolvedValueOnce({
      ...mockProfile,
      kycVideoKey: 'kyc-videos/user-1/abc.mp4',
      profileStatus: ProfileReviewStatus.PENDING_REVIEW,
      updatedAt: new Date(),
      user: { id: 'user-1', firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.com' },
    } as never);
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.completeMultipart('user-1', 'r2-upload-123', 'kyc-videos/user-1/abc.mp4', 'video/mp4', [
      { partNumber: 1, etag: 'etag1' },
      { partNumber: 2, etag: 'etag2' },
    ]);
    expect(res.profileStatus).toBe(ProfileReviewStatus.PENDING_REVIEW);
    expect(mockR2.completeMultipartUpload).toHaveBeenCalled();
    expect(mockCache.invalidate).toHaveBeenCalledWith('user-1');
  });

  it('rejects complete when parts missing sequence', async () => {
    const session = {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      r2UploadId: 'r2-upload-123',
      userId: 'user-1',
      contentType: 'video/mp4',
      partSize: 5 * 1024 * 1024,
      partCount: 2,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockRedis.get.mockResolvedValue(session);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    await expect(
      service.completeMultipart('user-1', 'r2-upload-123', 'kyc-videos/user-1/abc.mp4', 'video/mp4', [{ partNumber: 1, etag: 'etag1' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects complete when etag empty', async () => {
    const session = {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      r2UploadId: 'r2-upload-123',
      userId: 'user-1',
      contentType: 'video/mp4',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockRedis.get.mockResolvedValue(session);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    await expect(
      service.completeMultipart('user-1', 'r2-upload-123', 'kyc-videos/user-1/abc.mp4', 'video/mp4', [{ partNumber: 1, etag: '' }]),
    ).rejects.toThrow(BadRequestException);
  });

  it('is idempotent when already PENDING_REVIEW with same fileKey', async () => {
    const session = {
      fileKey: 'kyc-videos/user-1/abc.mp4',
      r2UploadId: 'r2-upload-123',
      userId: 'user-1',
      contentType: 'video/mp4',
      partSize: 5 * 1024 * 1024,
      partCount: 1,
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    mockRedis.get.mockResolvedValue(session);
    mockPrisma.beauticianProfile.findUnique.mockResolvedValueOnce(mockProfile);
    mockPrisma.beauticianProfile.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.beauticianProfile.findUnique.mockResolvedValueOnce({
      kycVideoKey: 'kyc-videos/user-1/abc.mp4',
      profileStatus: ProfileReviewStatus.PENDING_REVIEW,
    } as never);

    const res = await service.completeMultipart('user-1', 'r2-upload-123', 'kyc-videos/user-1/abc.mp4', 'video/mp4', [{ partNumber: 1, etag: 'etag1' }]);
    expect(res.profileStatus).toBe(ProfileReviewStatus.PENDING_REVIEW);
  });
});
