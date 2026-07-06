import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus, ProfileReviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService } from '../../cloudinary/cloudinary.service';
import { UpdateBeauticianProfileDto } from '../dto/update-beautician-profile.dto';
import { BeauticianNotificationService } from '../notification/services/beautician-notification.service';
import { serializeBeauticianProfile } from '../utils/beautician-profile.utils';
import { BeauticianMeCacheService } from './beautician-me-cache.service';

@Injectable()
export class BeauticianProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly notificationService: BeauticianNotificationService,
    private readonly meCache: BeauticianMeCacheService,
  ) {}

  async updateProfile(userId: string, dto: UpdateBeauticianProfileDto) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);

    const updateData: Prisma.BeauticianProfileUpdateInput = {
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.specialties !== undefined && { specialties: dto.specialties }),
      ...(dto.yearsOfExperience !== undefined && {
        yearsOfExperience: dto.yearsOfExperience,
      }),
      ...(dto.certifications !== undefined && {
        certifications: dto.certifications,
      }),
      ...(dto.profilePhotoUrl !== undefined && {
        profilePhotoUrl: dto.profilePhotoUrl,
      }),
    };

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    await this.meCache.invalidate(userId);

    return serializeBeauticianProfile(updated);
  }

  async uploadProfilePhoto(userId: string, file: Express.Multer.File) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);

    const upload = await this.cloudinaryService.uploadImage(
      file.buffer,
      'beauticians/profile-photos',
    );

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: { profilePhotoUrl: upload.secureUrl },
    });

    await this.meCache.invalidate(userId);

    return {
      profilePhotoUrl: updated.profilePhotoUrl,
      publicId: upload.publicId,
    };
  }

  async uploadCertification(userId: string, file: Express.Multer.File) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);

    const upload = await this.cloudinaryService.uploadImage(
      file.buffer,
      'beauticians/certifications',
    );

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        certifications: [...profile.certifications, upload.secureUrl],
      },
    });

    return {
      certifications: updated.certifications,
      uploadedUrl: upload.secureUrl,
    };
  }

  async submitForReview(userId: string) {
    const profile = await this.requireProfile(userId);
    this.assertProfileEditable(profile);
    this.assertProfileComplete(profile);

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        profileStatus: ProfileReviewStatus.PENDING_REVIEW,
        profileSubmittedAt: new Date(),
        reviewNotes: null,
      },
      include: {
        user: {
          select: { firstName: true, lastName: true, email: true },
        },
      },
    });

    await this.notificationService.notifyProfileSubmitted(updated.user);

    return {
      profileStatus: updated.profileStatus,
      profileSubmittedAt: updated.profileSubmittedAt,
      message:
        'Profile submitted for review. You will be notified after the in-office evaluation.',
    };
  }

  async getReviewStatus(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        profileStatus: true,
        profileSubmittedAt: true,
        profileReviewedAt: true,
        profileReviewedById: true,
        reviewNotes: true,
        profileReviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    return profile;
  }

  async approveProfile(
    profileId: string,
    adminUserId: string,
    notes?: string,
  ) {
    const profile = await this.requireProfileById(profileId);

    if (profile.profileStatus !== ProfileReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only profiles pending review can be approved',
      );
    }

    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new BadRequestException('KYC must be verified before profile approval');
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        profileStatus: ProfileReviewStatus.APPROVED,
        profileReviewedAt: new Date(),
        profileReviewedById: adminUserId,
        reviewNotes: notes ?? null,
      },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    await this.notificationService.notifyProfileReviewResult(
      updated.user,
      'APPROVED',
      notes,
    );

    return serializeBeauticianProfile(updated);
  }

  async rejectProfile(
    profileId: string,
    adminUserId: string,
    reason: string,
    notes?: string,
  ) {
    const profile = await this.requireProfileById(profileId);

    if (profile.profileStatus !== ProfileReviewStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        'Only profiles pending review can be rejected',
      );
    }

    const combinedNotes = notes ? `${reason}\n\n${notes}` : reason;

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        profileStatus: ProfileReviewStatus.REJECTED,
        profileReviewedAt: new Date(),
        profileReviewedById: adminUserId,
        reviewNotes: combinedNotes,
      },
      include: {
        user: {
          select: { email: true, firstName: true, lastName: true },
        },
      },
    });

    await this.notificationService.notifyProfileReviewResult(
      updated.user,
      'REJECTED',
      combinedNotes,
    );

    return serializeBeauticianProfile(updated);
  }

  private assertProfileEditable(profile: {
    kycStatus: KycStatus;
    profileStatus: ProfileReviewStatus;
  }) {
    if (profile.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException(
        'Complete KYC verification before updating your professional profile',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.PENDING_REVIEW) {
      throw new ForbiddenException(
        'Profile is locked while pending admin review',
      );
    }

    if (profile.profileStatus === ProfileReviewStatus.APPROVED) {
      throw new ForbiddenException(
        'Approved profiles cannot be edited via self-service in this version',
      );
    }
  }

  private assertProfileComplete(profile: {
    bio: string | null;
    profilePhotoUrl: string | null;
    specialties: string[];
    yearsOfExperience: number | null;
  }) {
    const missing: string[] = [];

    if (!profile.bio?.trim()) missing.push('bio');
    if (!profile.profilePhotoUrl) missing.push('profilePhotoUrl');
    if (!profile.specialties?.length) missing.push('specialties');
    if (profile.yearsOfExperience == null) missing.push('yearsOfExperience');

    if (missing.length > 0) {
      throw new BadRequestException(
        `Profile is incomplete. Missing required fields: ${missing.join(', ')}`,
      );
    }
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }

  private async requireProfileById(profileId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }
}