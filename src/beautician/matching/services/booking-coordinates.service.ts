import { Injectable, Logger } from '@nestjs/common';
import { GeocodingService } from '../../../common/services/geocoding.service';
import { RedisService } from '../../../redis/redis.service';
import {
  MATCHING_COORDS_CACHE_TTL_SECONDS,
  matchingRedisKeys,
} from '../constants/matching-queue.constants';

export type BookingCoordinates = { lat: number; lng: number };

type BookingLocationSource = {
  id: string;
  tempLatitude?: unknown;
  tempLongitude?: unknown;
  address: {
    latitude: unknown;
    longitude: unknown;
    fullAddress: string;
    placeId: string | null;
  } | null;
};

/**
 * Resolves customer coordinates for matching and caches geocode results
 * so repeated matching attempts do not re-hit Google.
 */
@Injectable()
export class BookingCoordinatesService {
  private readonly logger = new Logger(BookingCoordinatesService.name);

  constructor(
    private readonly geocodingService: GeocodingService,
    private readonly redis: RedisService,
  ) {}

  async resolve(booking: BookingLocationSource): Promise<BookingCoordinates | null> {
    if (booking.tempLatitude != null && booking.tempLongitude != null) {
      return {
        lat: Number(booking.tempLatitude),
        lng: Number(booking.tempLongitude),
      };
    }

    const address = booking.address;
    if (!address) {
      return null;
    }

    if (address.latitude != null && address.longitude != null) {
      return {
        lat: Number(address.latitude),
        lng: Number(address.longitude),
      };
    }

    const cacheKey = matchingRedisKeys.coordsCache(booking.id);
    const cached = await this.redis.get<BookingCoordinates>(cacheKey);
    if (cached?.lat != null && cached?.lng != null) {
      return cached;
    }

    const geocoded = await this.geocodeAddress(address);
    if (geocoded) {
      await this.redis.set(
        cacheKey,
        geocoded,
        MATCHING_COORDS_CACHE_TTL_SECONDS,
      );
    }
    return geocoded;
  }

  private async geocodeAddress(address: {
    fullAddress: string;
    placeId: string | null;
  }): Promise<BookingCoordinates | null> {
    if (address.placeId) {
      const byPlace = await this.geocodingService.geocodeByPlaceId(
        address.placeId,
      );
      if (byPlace) {
        return { lat: byPlace.latitude, lng: byPlace.longitude };
      }
    }

    const byText = await this.geocodingService.geocodeAddress(
      address.fullAddress,
    );
    if (!byText) {
      this.logger.warn(
        `Geocoding failed for address "${address.fullAddress}"`,
      );
      return null;
    }
    return { lat: byText.latitude, lng: byText.longitude };
  }
}
