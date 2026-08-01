import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CloudinaryService } from '../../../cloudinary/cloudinary.service';
import { RedisService } from '../../../redis/redis.service';

/**
 * Applies QoreID liveness image as the beautician profile photo.
 * Kept in KYC module to avoid circular imports with BeauticianModule.
 */
@Injectable()
export class KycProfilePhotoService {
  private readonly logger = new Logger(KycProfilePhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Download remote liveness image → Cloudinary `beauticians/profile-photos/` → save profilePhotoUrl.
   * Same DB field as the former POST /beauticians/me/profile-photo endpoint.
   */
  async applyFromRemoteLivenessUrl(
    userId: string,
    imageUrl: string,
  ): Promise<{ profilePhotoUrl: string; publicId: string }> {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException(
        `Beautician profile not found for user ${userId}`,
      );
    }

    const publicId = `beautician-${userId}`;
    const upload = await this.cloudinaryService.uploadImageFromUrl(
      imageUrl,
      'beauticians/profile-photos',
      publicId,
    );

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: { profilePhotoUrl: upload.secureUrl },
      select: { profilePhotoUrl: true },
    });

    await this.redis.del(`beautician:me:stable:${userId}`);

    this.logger.log(
      `Profile photo set from KYC liveness for user ${userId} (${upload.publicId})`,
    );

    return {
      profilePhotoUrl: updated.profilePhotoUrl!,
      publicId: upload.publicId,
    };
  }
}
