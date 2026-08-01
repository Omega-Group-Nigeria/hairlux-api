import { haversineKm } from './geo.util';

export const MAX_LOCATION_SPEED_KMH = 150;

export function computeSpeedKmh(
  fromLat: number,
  fromLng: number,
  fromTime: Date,
  toLat: number,
  toLng: number,
  toTime: Date,
): number {
  const elapsedMs = toTime.getTime() - fromTime.getTime();
  if (elapsedMs <= 0) {
    return 0;
  }

  const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  return distanceKm / elapsedHours;
}

export function isImplausibleLocationJump(
  fromLat: number,
  fromLng: number,
  fromTime: Date,
  toLat: number,
  toLng: number,
  toTime: Date,
  maxSpeedKmh = MAX_LOCATION_SPEED_KMH,
): boolean {
  return (
    computeSpeedKmh(fromLat, fromLng, fromTime, toLat, toLng, toTime) >
    maxSpeedKmh
  );
}