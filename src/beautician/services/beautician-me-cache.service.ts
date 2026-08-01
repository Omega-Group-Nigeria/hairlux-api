import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

export const BEAUTICIAN_ME_STABLE_CACHE_TTL_SECONDS = 3600;

export type BeauticianMeStableCache = {
  id: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  portfolioUrl: string | null;
  specialties: string[];
  yearsOfExperience: number | null;
  maxTravelRadiusKm: number | null;
  assignedServiceCount: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: string;
    status: string;
    emailVerified: boolean;
  };
};

@Injectable()
export class BeauticianMeCacheService {
  constructor(private readonly redis: RedisService) {}

  cacheKey(userId: string): string {
    return `beautician:me:stable:${userId}`;
  }

  async get(userId: string): Promise<BeauticianMeStableCache | null> {
    return this.redis.get<BeauticianMeStableCache>(this.cacheKey(userId));
  }

  async set(userId: string, data: BeauticianMeStableCache): Promise<void> {
    await this.redis.set(
      this.cacheKey(userId),
      data,
      BEAUTICIAN_ME_STABLE_CACHE_TTL_SECONDS,
    );
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(userId));
  }
}