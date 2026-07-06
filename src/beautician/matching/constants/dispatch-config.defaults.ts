export const DEFAULT_DISPATCH_REGION = 'default';

export type DispatchConfigValueType = 'string' | 'int' | 'float' | 'json';

export interface DispatchConfigDefault {
  key: string;
  value: string;
  valueType: DispatchConfigValueType;
}

export const DISPATCH_CONFIG_KEYS = {
  TIER_1_RADIUS_KM: 'tier_1_radius_km',
  TIER_2_RADIUS_KM: 'tier_2_radius_km',
  TIER_3_RADIUS_KM: 'tier_3_radius_km',
  OFFER_TTL_SECONDS_TIER_1: 'offer_ttl_seconds_tier_1',
  OFFER_TTL_SECONDS_TIER_2: 'offer_ttl_seconds_tier_2',
  OFFER_TTL_SECONDS_TIER_3: 'offer_ttl_seconds_tier_3',
  INTER_TIER_DELAY_SECONDS: 'inter_tier_delay_seconds',
  REJECTION_COOLDOWN_SECONDS: 'rejection_cooldown_seconds',
  LOCATION_STALENESS_MINUTES: 'location_staleness_minutes',
  LOCATION_REMATCH_MIN_DISTANCE_M: 'location_rematch_min_distance_m',
  SCORE_WEIGHT_DISTANCE: 'score_weight_distance',
  SCORE_WEIGHT_RATING: 'score_weight_rating',
  SCORE_WEIGHT_ACCEPTANCE_RATE: 'score_weight_acceptance_rate',
  SCORE_WEIGHT_IDLE_MINUTES: 'score_weight_idle_minutes',
  WAKE_EXHAUSTED_ON_ONLINE_ENABLED: 'wake_exhausted_on_online_enabled',
} as const;

export const DISPATCH_CONFIG_DEFAULTS: DispatchConfigDefault[] = [
  { key: DISPATCH_CONFIG_KEYS.TIER_1_RADIUS_KM, value: '5', valueType: 'int' },
  { key: DISPATCH_CONFIG_KEYS.TIER_2_RADIUS_KM, value: '12', valueType: 'int' },
  { key: DISPATCH_CONFIG_KEYS.TIER_3_RADIUS_KM, value: '25', valueType: 'int' },
  {
    key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_1,
    value: '45',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_2,
    value: '60',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_3,
    value: '75',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.INTER_TIER_DELAY_SECONDS,
    value: '15',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.REJECTION_COOLDOWN_SECONDS,
    value: '120',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.LOCATION_STALENESS_MINUTES,
    value: '5',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.LOCATION_REMATCH_MIN_DISTANCE_M,
    value: '500',
    valueType: 'int',
  },
  {
    key: DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_DISTANCE,
    value: '1',
    valueType: 'float',
  },
  {
    key: DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_RATING,
    value: '0.3',
    valueType: 'float',
  },
  {
    key: DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_ACCEPTANCE_RATE,
    value: '0.2',
    valueType: 'float',
  },
  {
    key: DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_IDLE_MINUTES,
    value: '0.1',
    valueType: 'float',
  },
  {
    key: DISPATCH_CONFIG_KEYS.WAKE_EXHAUSTED_ON_ONLINE_ENABLED,
    value: '0',
    valueType: 'int',
  },
];