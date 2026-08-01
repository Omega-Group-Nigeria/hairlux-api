import { NotFoundException } from '@nestjs/common';
import { KycProfilePhotoService } from './kyc-profile-photo.service';

describe('KycProfilePhotoService', () => {
  let service: KycProfilePhotoService;

  const mockPrisma = {
    beauticianProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCloudinary = {
    uploadImageFromUrl: jest.fn(),
  };

  const mockRedis = {
    del: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KycProfilePhotoService(
      mockPrisma as never,
      mockCloudinary as never,
      mockRedis as never,
    );
  });

  it('uploads remote liveness image to beauticians/profile-photos and saves profilePhotoUrl', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue({ id: 'p1' });
    mockCloudinary.uploadImageFromUrl.mockResolvedValue({
      secureUrl:
        'https://res.cloudinary.com/demo/beauticians/profile-photos/beautician-user-1.webp',
      publicId: 'beauticians/profile-photos/beautician-user-1',
      url: 'http://res.cloudinary.com/demo/beauticians/profile-photos/beautician-user-1.webp',
    });
    mockPrisma.beauticianProfile.update.mockResolvedValue({
      profilePhotoUrl:
        'https://res.cloudinary.com/demo/beauticians/profile-photos/beautician-user-1.webp',
    });

    const result = await service.applyFromRemoteLivenessUrl(
      'user-1',
      'https://media.qoreid.com/v1/file/abc',
    );

    expect(mockCloudinary.uploadImageFromUrl).toHaveBeenCalledWith(
      'https://media.qoreid.com/v1/file/abc',
      'beauticians/profile-photos',
      'beautician-user-1',
    );
    expect(mockPrisma.beauticianProfile.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: {
        profilePhotoUrl:
          'https://res.cloudinary.com/demo/beauticians/profile-photos/beautician-user-1.webp',
      },
      select: { profilePhotoUrl: true },
    });
    expect(mockRedis.del).toHaveBeenCalledWith('beautician:me:stable:user-1');
    expect(result.profilePhotoUrl).toContain('cloudinary');
  });

  it('throws when profile is missing', async () => {
    mockPrisma.beauticianProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.applyFromRemoteLivenessUrl('missing', 'https://example.com/a.jpg'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mockCloudinary.uploadImageFromUrl).not.toHaveBeenCalled();
  });
});
