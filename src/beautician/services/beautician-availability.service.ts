import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BeauticianAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async updateAvailability(
    userId: string,
    status: AvailabilityStatus,
  ) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    const isFullyVerified =
      profile.isActive &&
      profile.kycStatus === KycStatus.VERIFIED &&
      profile.profileStatus === ProfileReviewStatus.APPROVED;

    if (!isFullyVerified) {
      throw new ForbiddenException(
        'You must be fully verified before changing availability',
      );
    }

    if (
      profile.availabilityStatus === AvailabilityStatus.ON_JOB &&
      status === AvailabilityStatus.ONLINE
    ) {
      throw new BadRequestException(
        'Cannot go online while on an active job. Complete the job first.',
      );
    }

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: { availabilityStatus: status },
      select: {
        availabilityStatus: true,
        updatedAt: true,
      },
    });

    return updated;
  }
}