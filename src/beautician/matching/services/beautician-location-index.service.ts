import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import {
  BEAUTICIANS_ONLINE_GEO_KEY,
  beauticianMetaKey,
} from '../constants/location-index.constants';

export interface GeoSearchHit {
  userId: string;
  distanceKm: number;
}

@Injectable()
export class BeauticianLocationIndexService implements OnModuleInit {
  private readonly logger = new Logger(BeauticianLocationIndexService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    void this.reconcileFromPostgres();
  }

  async upsertOnline(params: {
    userId: string;
    lat: number;
    lng: number;
    serviceIds?: string[];
    updatedAt?: Date;
  }) {
    await this.redis.geoAdd(
      BEAUTICIANS_ONLINE_GEO_KEY,
      params.lng,
      params.lat,
      params.userId,
    );

    await this.redis.hset(beauticianMetaKey(params.userId), {
      lat: String(params.lat),
      lng: String(params.lng),
      services: (params.serviceIds ?? []).join(','),
      updatedAt: (params.updatedAt ?? new Date()).toISOString(),
    });
  }

  async remove(userId: string) {
    await this.redis.geoRemove(BEAUTICIANS_ONLINE_GEO_KEY, userId);
    await this.redis.del(beauticianMetaKey(userId));
  }

  async searchNearby(
    lng: number,
    lat: number,
    radiusKm: number,
    count = 50,
  ): Promise<GeoSearchHit[]> {
    const hits = await this.redis.geoSearchByRadius(
      BEAUTICIANS_ONLINE_GEO_KEY,
      lng,
      lat,
      radiusKm,
      count,
    );

    return hits.map((hit) => ({
      userId: hit.member,
      distanceKm: hit.distanceKm,
    }));
  }

  async reconcileFromPostgres() {
    try {
      const profiles = await this.prisma.beauticianProfile.findMany({
        where: {
          isActive: true,
          dispatchSuspended: false,
          kycStatus: KycStatus.VERIFIED,
          profileStatus: ProfileReviewStatus.APPROVED,
          availabilityStatus: AvailabilityStatus.ONLINE,
          currentLat: { not: null },
          currentLng: { not: null },
        },
        include: {
          assignedServices: { select: { serviceId: true } },
        },
      });

      for (const profile of profiles) {
        await this.upsertOnline({
          userId: profile.userId,
          lat: Number(profile.currentLat),
          lng: Number(profile.currentLng),
          serviceIds: profile.assignedServices.map((item) => item.serviceId),
          updatedAt: profile.lastLocationUpdate ?? profile.updatedAt,
        });
      }

      if (profiles.length) {
        this.logger.log(
          `Reconciled ${profiles.length} online beautician(s) into Redis geo index`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Geo index reconciliation failed: ${(err as Error).message}`,
      );
    }
  }
}