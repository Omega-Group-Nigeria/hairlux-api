import { BadRequestException } from '@nestjs/common';
import { BookingType } from '@prisma/client';

export interface BookingPricedService {
  name: string;
  walkInPrice: { toNumber: () => number } | number;
  homeServicePrice: { toNumber: () => number } | number;
  isWalkInAvailable: boolean;
  isHomeServiceAvailable: boolean;
}

export function resolvePriceForBookingType(
  service: BookingPricedService,
  bookingType: BookingType,
): number {
  if (bookingType === BookingType.WALK_IN) {
    if (!service.isWalkInAvailable) {
      throw new BadRequestException(
        `Service "${service.name}" is not available for WALK_IN bookings`,
      );
    }

    return typeof service.walkInPrice === 'number'
      ? service.walkInPrice
      : service.walkInPrice.toNumber();
  }

  if (!service.isHomeServiceAvailable) {
    throw new BadRequestException(
      `Service "${service.name}" is not available for HOME_SERVICE bookings`,
    );
  }

  return typeof service.homeServicePrice === 'number'
    ? service.homeServicePrice
    : service.homeServicePrice.toNumber();
}

export function formatBookingAddress(address: unknown) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return null;
  }

  const raw = address as Record<string, unknown>;
  return {
    id: raw.id,
    fullAddress: raw.fullAddress ?? null,
    streetAddress: raw.streetAddress ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    country: raw.country ?? null,
    placeId: raw.placeId ?? null,
    addressComponents: raw.addressComponents ?? null,
    isDefault: raw.isDefault ?? false,
  };
}
