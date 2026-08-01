/**
 * Helpers for resolving a HOME_SERVICE booking location from either a saved
 * Address relation or inline temporary (current-location) fields on Booking.
 */

export type SavedAddressLike = {
  fullAddress: string;
  latitude?: unknown;
  longitude?: unknown;
  city?: string | null;
  state?: string | null;
  placeId?: string | null;
  streetAddress?: string | null;
  country?: string | null;
  addressComponents?: unknown;
  id?: string;
  isDefault?: boolean;
} | null | undefined;

export type BookingLocationSource = {
  address?: SavedAddressLike;
  addressId?: string | null;
  tempLatitude?: unknown;
  tempLongitude?: unknown;
  tempFullAddress?: string | null;
};

export type ResolvedBookingLocation = {
  source: 'saved' | 'temporary';
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  placeId: string | null;
};

export function hasTemporaryServiceLocation(input: {
  tempLatitude?: unknown;
  tempLongitude?: unknown;
  tempFullAddress?: string | null;
}): boolean {
  if (
    input.tempLatitude === undefined ||
    input.tempLatitude === null ||
    input.tempLongitude === undefined ||
    input.tempLongitude === null
  ) {
    return false;
  }

  if (typeof input.tempFullAddress !== 'string') {
    return false;
  }

  return input.tempFullAddress.trim().length > 0;
}

function toCoord(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prefer a linked saved address when present; otherwise use temp_* fields.
 */
export function resolveBookingServiceLocation(
  booking: BookingLocationSource,
): ResolvedBookingLocation | null {
  if (booking.address) {
    return {
      source: 'saved',
      fullAddress: booking.address.fullAddress,
      lat: toCoord(booking.address.latitude),
      lng: toCoord(booking.address.longitude),
      city: booking.address.city ?? null,
      state: booking.address.state ?? null,
      placeId: booking.address.placeId ?? null,
    };
  }

  if (hasTemporaryServiceLocation(booking)) {
    return {
      source: 'temporary',
      fullAddress: String(booking.tempFullAddress).trim(),
      lat: toCoord(booking.tempLatitude),
      lng: toCoord(booking.tempLongitude),
      city: null,
      state: null,
      placeId: null,
    };
  }

  return null;
}

/**
 * Sync lat/lng only (no geocoding). Used by matching wake-up and arrival geo fence.
 */
export function resolveBookingCoordinatesSync(
  booking: BookingLocationSource,
): { lat: number; lng: number } | null {
  const location = resolveBookingServiceLocation(booking);
  if (!location || location.lat == null || location.lng == null) {
    return null;
  }
  return { lat: location.lat, lng: location.lng };
}

/**
 * Human-readable address string for emails / notes.
 */
export function resolveBookingAddressLabel(
  booking: BookingLocationSource,
  walkInFallback = 'In-store (Walk-in)',
): string {
  const location = resolveBookingServiceLocation(booking);
  return location?.fullAddress ?? walkInFallback;
}

/**
 * API-shaped address object used in booking responses when either a saved
 * address or a temporary location is present.
 */
export function formatBookingServiceAddress(
  booking: BookingLocationSource,
): Record<string, unknown> | null {
  const location = resolveBookingServiceLocation(booking);
  if (!location) {
    return null;
  }

  if (location.source === 'saved' && booking.address) {
    const addr = booking.address;
    return {
      id: addr.id ?? null,
      fullAddress: location.fullAddress,
      streetAddress: addr.streetAddress ?? null,
      city: location.city,
      state: location.state,
      country: addr.country ?? 'Nigeria',
      placeId: location.placeId,
      addressComponents: addr.addressComponents ?? {
        streetAddress: addr.streetAddress ?? null,
        city: location.city,
        state: location.state,
        country: addr.country ?? 'Nigeria',
      },
      isDefault: addr.isDefault ?? false,
      isTemporary: false,
      latitude: location.lat,
      longitude: location.lng,
    };
  }

  return {
    id: null,
    fullAddress: location.fullAddress,
    streetAddress: null,
    city: null,
    state: null,
    country: 'Nigeria',
    placeId: null,
    addressComponents: {
      streetAddress: null,
      city: null,
      state: null,
      country: 'Nigeria',
    },
    isDefault: false,
    isTemporary: true,
    latitude: location.lat,
    longitude: location.lng,
  };
}

/**
 * Prisma create/update fragment for location fields from a booking DTO.
 * When `addressId` is set, temp fields are cleared. When only temp is set,
 * addressId is null.
 */
export function buildBookingLocationCreateData(input: {
  addressId?: string | null;
  tempLatitude?: number | null;
  tempLongitude?: number | null;
  tempFullAddress?: string | null;
}): {
  addressId: string | null;
  tempLatitude: number | null;
  tempLongitude: number | null;
  tempFullAddress: string | null;
} {
  if (input.addressId) {
    return {
      addressId: input.addressId,
      tempLatitude: null,
      tempLongitude: null,
      tempFullAddress: null,
    };
  }

  if (hasTemporaryServiceLocation(input)) {
    return {
      addressId: null,
      tempLatitude: Number(input.tempLatitude),
      tempLongitude: Number(input.tempLongitude),
      tempFullAddress: String(input.tempFullAddress).trim(),
    };
  }

  return {
    addressId: null,
    tempLatitude: null,
    tempLongitude: null,
    tempFullAddress: null,
  };
}
