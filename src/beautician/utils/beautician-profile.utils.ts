export function serializeBeauticianProfile<T extends Record<string, unknown>>(
  profile: T,
) {
  const decimalFields = [
    'serviceRadiusKm',
    'baseLat',
    'baseLng',
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