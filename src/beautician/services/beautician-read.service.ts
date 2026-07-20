import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../../wallet/wallet.service';
import {
  buildBeauticianMeResponse,
  buildBeauticianMeStableCache,
  extractBeauticianMeVolatile,
  serializeBeauticianProfile,
} from '../utils/beautician-profile.utils';
import { BeauticianMeCacheService } from './beautician-me-cache.service';

const BEAUTICIAN_ME_VOLATILE_SELECT = {
  availabilityStatus: true,
  currentLat: true,
  currentLng: true,
  lastLocationUpdate: true,
  kycStatus: true,
  profileStatus: true,
  isActive: true,
  dispatchSuspended: true,
  dispatchSuspendedUntil: true,
  dispatchSuspensionReason: true,
  ratingAverage: true,
  totalJobsCompleted: true,
  totalEarnings: true,
} as const;

const BEAUTICIAN_ME_STABLE_SELECT = {
  id: true,
  bio: true,
  profilePhotoUrl: true,
  portfolioUrl: true,
  specialties: true,
  yearsOfExperience: true,
  maxTravelRadiusKm: true,
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
} as const;

const BEAUTICIAN_ME_FULL_SELECT = {
  ...BEAUTICIAN_ME_STABLE_SELECT,
  ...BEAUTICIAN_ME_VOLATILE_SELECT,
} as const;

@Injectable()
export class BeauticianReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly meCache: BeauticianMeCacheService,
  ) {}

  async getMyProfile(userId: string) {
    const [cachedStable, wallet] = await Promise.all([
      this.meCache.get(userId),
      this.walletService.getBalance(userId),
    ]);

    if (cachedStable) {
      const volatile = await this.loadVolatileProfile(userId);
      return buildBeauticianMeResponse(
        cachedStable,
        volatile,
        wallet.balance,
      );
    }

    const profile = await this.loadFullMeProfile(userId);
    const stable = buildBeauticianMeStableCache(profile);
    const volatile = extractBeauticianMeVolatile(profile);

    void this.meCache.set(userId, stable);

    return buildBeauticianMeResponse(stable, volatile, wallet.balance);
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

  private async loadFullMeProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: BEAUTICIAN_ME_FULL_SELECT,
    });

    if (!profile) {
      throw new ForbiddenException('You do not have a beautician profile');
    }

    return profile;
  }

  private async loadVolatileProfile(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: BEAUTICIAN_ME_VOLATILE_SELECT,
    });

    if (!profile) {
      throw new ForbiddenException('You do not have a beautician profile');
    }

    return profile;
  }
}