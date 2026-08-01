import { Injectable } from '@nestjs/common';
import {
  DEFAULT_DISPATCH_REGION,
  DISPATCH_CONFIG_KEYS,
} from '../constants/dispatch-config.defaults';
import { DispatchConfigStoreService } from './dispatch-config-store.service';
import { DispatchConfigResolverService } from './dispatch-config-resolver.service';
import { UpdateDispatchSettingsDto } from '../dto/update-dispatch-settings.dto';

@Injectable()
export class DispatchConfigAdminService {
  constructor(
    private readonly store: DispatchConfigStoreService,
    private readonly resolver: DispatchConfigResolverService,
  ) {}

  async getSettings(region = DEFAULT_DISPATCH_REGION) {
    await this.store.ensureDefaults(region);
    await this.store.reload(region);

    return {
      region,
      tiers: [
        {
          tier: 1,
          radiusKm: this.resolver.getTierRadiusKm(1),
          offerTtlSeconds: this.resolver.getTierOfferTtlSeconds(1),
        },
        {
          tier: 2,
          radiusKm: this.resolver.getTierRadiusKm(2),
          offerTtlSeconds: this.resolver.getTierOfferTtlSeconds(2),
        },
        {
          tier: 3,
          radiusKm: this.resolver.getTierRadiusKm(3),
          offerTtlSeconds: this.resolver.getTierOfferTtlSeconds(3),
        },
      ],
      interTierDelaySeconds: this.resolver.getInt(
        DISPATCH_CONFIG_KEYS.INTER_TIER_DELAY_SECONDS,
        15,
      ),
      locationStalenessMinutes: this.resolver.getInt(
        DISPATCH_CONFIG_KEYS.LOCATION_STALENESS_MINUTES,
        5,
      ),
      locationRematchMinDistanceM: this.resolver.getInt(
        DISPATCH_CONFIG_KEYS.LOCATION_REMATCH_MIN_DISTANCE_M,
        500,
      ),
      wakeExhaustedOnOnlineEnabled:
        this.resolver.getInt(
          DISPATCH_CONFIG_KEYS.WAKE_EXHAUSTED_ON_ONLINE_ENABLED,
          0,
        ) === 1,
      scoringWeights: {
        distance: this.resolver.getFloat(
          DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_DISTANCE,
          1,
        ),
        rating: this.resolver.getFloat(
          DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_RATING,
          0.3,
        ),
        acceptanceRate: this.resolver.getFloat(
          DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_ACCEPTANCE_RATE,
          0.2,
        ),
        idleMinutes: this.resolver.getFloat(
          DISPATCH_CONFIG_KEYS.SCORE_WEIGHT_IDLE_MINUTES,
          0.1,
        ),
      },
      envOverrides: {
        homeServiceMatchingRadiiKm: this.resolver.getRadiiKmFromEnv(),
        dispatchOfferTtlSeconds: this.resolver.getGlobalOfferTtlOverride(),
      },
    };
  }

  async updateSettings(dto: UpdateDispatchSettingsDto, region = DEFAULT_DISPATCH_REGION) {
    const updates: Array<{
      key: string;
      value: string;
      valueType: 'int';
    }> = [];

    const tier1 = dto.tiers?.find((tier) => tier.tier === 1);
    const tier2 = dto.tiers?.find((tier) => tier.tier === 2);
    const tier3 = dto.tiers?.find((tier) => tier.tier === 3);

    if (tier1?.radiusKm !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.TIER_1_RADIUS_KM,
        value: String(tier1.radiusKm),
        valueType: 'int',
      });
    }
    if (tier1?.offerTtlSeconds !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_1,
        value: String(tier1.offerTtlSeconds),
        valueType: 'int',
      });
    }
    if (tier2?.radiusKm !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.TIER_2_RADIUS_KM,
        value: String(tier2.radiusKm),
        valueType: 'int',
      });
    }
    if (tier2?.offerTtlSeconds !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_2,
        value: String(tier2.offerTtlSeconds),
        valueType: 'int',
      });
    }
    if (tier3?.radiusKm !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.TIER_3_RADIUS_KM,
        value: String(tier3.radiusKm),
        valueType: 'int',
      });
    }
    if (tier3?.offerTtlSeconds !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.OFFER_TTL_SECONDS_TIER_3,
        value: String(tier3.offerTtlSeconds),
        valueType: 'int',
      });
    }

    if (dto.interTierDelaySeconds !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.INTER_TIER_DELAY_SECONDS,
        value: String(dto.interTierDelaySeconds),
        valueType: 'int',
      });
    }
    if (dto.locationStalenessMinutes !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.LOCATION_STALENESS_MINUTES,
        value: String(dto.locationStalenessMinutes),
        valueType: 'int',
      });
    }
    if (dto.locationRematchMinDistanceM !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.LOCATION_REMATCH_MIN_DISTANCE_M,
        value: String(dto.locationRematchMinDistanceM),
        valueType: 'int',
      });
    }
    if (dto.wakeExhaustedOnOnlineEnabled !== undefined) {
      updates.push({
        key: DISPATCH_CONFIG_KEYS.WAKE_EXHAUSTED_ON_ONLINE_ENABLED,
        value: dto.wakeExhaustedOnOnlineEnabled ? '1' : '0',
        valueType: 'int',
      });
    }

    if (updates.length > 0) {
      await this.store.upsertEntries(region, updates);
    }

    return this.getSettings(region);
  }
}