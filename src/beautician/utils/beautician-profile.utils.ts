import {
  AvailabilityStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import type { BeauticianMeStableCache } from '../services/beautician-me-cache.service';

export function serializeBeauticianProfile<T extends Record<string, unknown>>(
  profile: T,
) {
  const decimalFields = [
    'currentLat',
    'currentLng',
    'ratingAverage',
    'totalEarnings',
    'commissionRateOverride',
  ] as const;

  const serialized = { ...profile } as Record<string, unknown>;

  for (const field of decimalFields) {
    if (serialized[field] != null) {
      serialized[field] = Number(serialized[field]);
    }
  }

  return serialized;
}

export type BeauticianMeVolatileInput = {
  availabilityStatus: AvailabilityStatus;
  currentLat: { toNumber?: () => number } | number | null;
  currentLng: { toNumber?: () => number } | number | null;
  lastLocationUpdate: Date | null;
  kycStatus: KycStatus;
  profileStatus: ProfileReviewStatus;
  isActive: boolean;
  dispatchSuspended: boolean;
  ratingAverage: { toNumber?: () => number } | number;
  totalJobsCompleted: number;
  totalEarnings: { toNumber?: () => number } | number;
};

export function extractBeauticianMeVolatile(
  profile: BeauticianMeVolatileInput,
): BeauticianMeVolatileInput {
  return {
    availabilityStatus: profile.availabilityStatus,
    currentLat: profile.currentLat,
    currentLng: profile.currentLng,
    lastLocationUpdate: profile.lastLocationUpdate,
    kycStatus: profile.kycStatus,
    profileStatus: profile.profileStatus,
    isActive: profile.isActive,
    dispatchSuspended: profile.dispatchSuspended,
    ratingAverage: profile.ratingAverage,
    totalJobsCompleted: profile.totalJobsCompleted,
    totalEarnings: profile.totalEarnings,
  };
}

export function toDecimalNumber(
  value: { toNumber?: () => number } | number | null | undefined,
): number | null {
  if (value == null) {
    return null;
  }

  return typeof value === 'number' ? value : Number(value);
}

export function buildBeauticianMeStableCache(profile: {
  id: string;
  bio: string | null;
  profilePhotoUrl: string | null;
  specialties: string[];
  yearsOfExperience: number | null;
  maxTravelRadiusKm: { toNumber?: () => number } | number | null;
  user: BeauticianMeStableCache['user'];
  _count: { assignedServices: number };
}): BeauticianMeStableCache {
  return {
    id: profile.id,
    bio: profile.bio,
    profilePhotoUrl: profile.profilePhotoUrl,
    specialties: profile.specialties,
    yearsOfExperience: profile.yearsOfExperience,
    maxTravelRadiusKm: toDecimalNumber(profile.maxTravelRadiusKm),
    assignedServiceCount: profile._count.assignedServices,
    user: profile.user,
  };
}

export function buildBeauticianMeResponse(
  stable: BeauticianMeStableCache,
  volatile: BeauticianMeVolatileInput,
  walletBalance: number,
) {
  const isFullyVerified =
    volatile.kycStatus === KycStatus.VERIFIED &&
    volatile.profileStatus === ProfileReviewStatus.APPROVED &&
    volatile.isActive;

  return {
    id: stable.id,
    bio: stable.bio,
    profilePhotoUrl: stable.profilePhotoUrl,
    specialties: stable.specialties,
    yearsOfExperience: stable.yearsOfExperience,
    maxTravelRadiusKm: stable.maxTravelRadiusKm,
    assignedServiceCount: stable.assignedServiceCount,
    availabilityStatus: volatile.availabilityStatus,
    currentLat: toDecimalNumber(volatile.currentLat),
    currentLng: toDecimalNumber(volatile.currentLng),
    lastLocationUpdate: volatile.lastLocationUpdate,
    kycStatus: volatile.kycStatus,
    profileStatus: volatile.profileStatus,
    isActive: volatile.isActive,
    dispatchSuspended: volatile.dispatchSuspended,
    ratingAverage: toDecimalNumber(volatile.ratingAverage) ?? 0,
    totalJobsCompleted: volatile.totalJobsCompleted,
    totalEarnings: toDecimalNumber(volatile.totalEarnings) ?? 0,
    user: stable.user,
    walletBalance,
    isFullyVerified,
    canGoOnline: isFullyVerified,
  };
}