import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { BeauticianProfileService } from './beautician-profile.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeocodingService } from '../../common/services/geocoding.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { BeauticianNotificationService } from '../notification/services/beautician-notification.service';

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
    baseAddress: 'Lekki, Lagos',
    serviceRadiusKm: 20,
  };

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockGeocoding = { geocodeAddress: jest.fn() };
  const mockCloudinary = { uploadImage: jest.fn() };
  const mockNotification = {
    notifyProfileSubmitted: jest.fn(),
    notifyProfileReviewResult: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeauticianProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeocodingService, useValue: mockGeocoding },
        { provide: CloudinaryService, useValue: mockCloudinary },
        { provide: BeauticianNotificationService, useValue: mockNotification },
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

  it('submits profile for review and locks further edits', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(mockProfile);
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      ...mockProfile,
      profileStatus: ProfileReviewStatus.PENDING_REVIEW,
      profileSubmittedAt: new Date(),
      user: { firstName: 'Ada', lastName: 'Okafor', email: 'ada@example.com' },
    });

    const result = await service.submitForReview('user-1');

    expect(result.profileStatus).toBe(ProfileReviewStatus.PENDING_REVIEW);
    expect(mockNotification.notifyProfileSubmitted).toHaveBeenCalled();
  });
});