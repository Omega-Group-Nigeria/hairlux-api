import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DISPATCH_CONFIG_KEYS,
  DispatchConfigDefault,
  DISPATCH_CONFIG_DEFAULTS,
} from '../constants/dispatch-config.defaults';
import { DispatchConfigStoreService } from './dispatch-config-store.service';
import {
  parsePositiveFloat,
  parsePositiveInt,
} from '../utils/dispatch-config-value.parser';

@Injectable()
export class DispatchConfigResolverService {
  constructor(
    private readonly store: DispatchConfigStoreService,
    private readonly configService: ConfigService,
  ) {}

  getFloat(key: string, fallback: number): number {
    const entry = this.store.getEntry(key);
    if (entry) {
      return parsePositiveFloat(entry.value, fallback);
    }

    const defaultEntry = DISPATCH_CONFIG_DEFAULTS.find((item) => item.key === key);
    return defaultEntry
      ? parsePositiveFloat(defaultEntry.value, fallback)
      : fallback;
  }

  getInt(key: string, fallback: number): number {
    const entry = this.store.getEntry(key);
    if (entry) {
      return parsePositiveInt(entry.value, fallback);
    }

    const defaultEntry = DISPATCH_CONFIG_DEFAULTS.find((item) => item.key === key);
    return defaultEntry
      ? parsePositiveInt(defaultEntry.value, fallback)
      : fallback;
  }

  getRadiiKmFromEnv(): number[] | null {
    const raw = this.configService.get<string>('HOME_SERVICE_MATCHING_RADII_KM');
    if (!raw?.trim()) {
      return null;
    }

    const parsed = raw
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    return parsed.length > 0 ? parsed : null;
  }

  getGlobalOfferTtlOverride(): number | null {
    const override = Number(
      this.configService.get<string>('DISPATCH_OFFER_TTL_SECONDS', ''),
    );

    return Number.isFinite(override) && override > 0 ? override : null;
  }

  getTierRadiusKm(tier: number): number {
    const envRadii = this.getRadiiKmFromEnv();
    if (envRadii) {
      const index = Math.min(Math.max(tier, 1), envRadii.length) - 1;
      return envRadii[index];
    }

    const keyByTier: Record<number, string> = {
      1: DISPATCH_CONFIG_KEYS.TIER_1_RADIUS_KM,
      2: DISPATCH_CONFIG_KEYS.TIER_2_RADIUS_KM,
      3: DISPATCH_CONFIG_KEYS.TIER_3_RADIUS_KM,
    };

    const key = keyByTier[tier] ?? DISPATCH_CONFIG_KEYS.TIER_3_RADIUS_KM;
    const fallback = this.defaultForKey(key);
    return this.getInt(key, fallback ? parsePositiveInt(fallback.value, 25) : 25);
  }

  getTierOfferTtlSeconds(tier: number): number {
    const globalOverride = this.getGlobalOfferTtlOverride();
    if (globalOverride) {
      return globalOverride;
    }

    const keyByTier: Record<number, string> = {
      1: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_1,
      2: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_2,
      3: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_3,
    };

    const key = keyByTier[tier] ?? DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_3;
    const fallback = this.defaultForKey(key);
    return this.getInt(key, fallback ? parsePositiveInt(fallback.value, 60) : 60);
  }

  private defaultForKey(key: string): DispatchConfigDefault | undefined {
    return DISPATCH_CONFIG_DEFAULTS.find((item) => item.key === key);
  }
}