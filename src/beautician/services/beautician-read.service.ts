import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeBeauticianProfile } from '../utils/beautician-profile.utils';

@Injectable()
export class BeauticianReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            emailVerified: true,
          },
        },
        _count: { select: { assignedServices: true } },
      },
    });

    if (!profile) {
      throw new ForbiddenException('You do not have a beautician profile');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });

    const isFullyVerified =
      profile.kycStatus === KycStatus.VERIFIED &&
      profile.profileStatus === ProfileReviewStatus.APPROVED &&
      profile.isActive;

    return {
      ...serializeBeauticianProfile(profile),
      walletBalance: Number(wallet?.balance ?? 0),
      isFullyVerified,
      canGoOnline: isFullyVerified,
    };
  }

  async getProfileByUserId(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    return serializeBeauticianProfile(profile);
  }
}