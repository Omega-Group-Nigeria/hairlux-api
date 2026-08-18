/**
 * Admin-configured serviceable areas for HOME_SERVICE bookings.
 *
 * An area is a `{ state, city }` pair. `city` may be "*" to allow every city
 * in that state. Matching is case-insensitive and whitespace-trimmed. An empty
 * area list means home service is disabled everywhere (the safe default).
 */

export const SERVICEABLE_AREA_WILDCARD_CITY = '*';

export type ServiceableArea = {
  state: string;
  city: string;
};

export type ServiceableLocation = {
  city?: string | null;
  state?: string | null;
};

export function normalizeAreaPart(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** Coerce arbitrary stored JSON (or an admin DTO value) into normalized areas. */
export function parseServiceableAreas(value: unknown): ServiceableArea[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const areas: ServiceableArea[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }

    const state = normalizeAreaPart((entry as Record<string, unknown>).state);
    const city = normalizeAreaPart((entry as Record<string, unknown>).city);
    if (!state || !city) {
      continue;
    }

    areas.push({ state, city });
  }

  return areas;
}

/**
 * An empty/unknown location is never serviceable (request must not silently
 * bypass the restriction). `null/undefined` state or city also fails closed.
 */
export function isLocationServiceable(
  location: ServiceableLocation | null | undefined,
  areas: ServiceableArea[],
): boolean {
  const bookingState = normalizeAreaPart(location?.state);
  const bookingCity = normalizeAreaPart(location?.city);
  if (!bookingState || !bookingCity) {
    return false;
  }

  return areas.some(
    (area) =>
      area.state === bookingState &&
      (area.city === SERVICEABLE_AREA_WILDCARD_CITY ||
        area.city === bookingCity),
  );
}
