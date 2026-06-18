import { BadRequestException } from '@nestjs/common';
import { BookingType } from '@prisma/client';
import { resolvePriceForBookingType } from '../../booking/utils/booking.utils';
import {
  BranchAssignmentLike,
  CatalogWalkInPriced,
  resolveBranchWalkInPrice,
} from './branch-pricing.utils';

type ServiceModeItem = { serviceMode?: BookingType };

export function bookingIncludesWalkIn(
  services: ServiceModeItem[],
  fallbackBookingType?: BookingType,
): boolean {
  if (
    Array.isArray(services) &&
    services.some((item) => item?.serviceMode === BookingType.WALK_IN)
  ) {
    return true;
  }

  return fallbackBookingType === BookingType.WALK_IN;
}

export function resolveBookingLineUnitPrice(params: {
  service: CatalogWalkInPriced & {
    name: string;
    homeServicePrice: { toNumber: () => number } | number;
    isWalkInAvailable: boolean;
    isHomeServiceAvailable: boolean;
  };
  serviceMode: BookingType;
  branchId?: string | null;
  branchAssignment?: BranchAssignmentLike & { isAvailable?: boolean } | null;
}): number {
  const { service, serviceMode, branchId, branchAssignment } = params;

  if (serviceMode === BookingType.WALK_IN && branchId) {
    if (!branchAssignment?.isAvailable) {
      throw new BadRequestException(
        `Service "${service.name}" is not available at the selected branch`,
      );
    }

    return resolveBranchWalkInPrice(service, branchAssignment);
  }

  return resolvePriceForBookingType(service, serviceMode);
}