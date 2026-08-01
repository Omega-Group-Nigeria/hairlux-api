import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  formattedAddress?: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not configured — skipping geocode');
      return null;
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: { address, key: apiKey },
        }),
      );

      if (data.status !== 'OK' || !data.results?.length) {
        this.logger.warn(
          `Geocode failed for address: ${data.status ?? 'UNKNOWN'}`,
        );
        return null;
      }

      const result = data.results[0];
      const { lat, lng } = result.geometry.location;

      return {
        latitude: lat,
        longitude: lng,
        formattedAddress: result.formatted_address,
      };
    } catch (error) {
      this.logger.error(
        `Geocoding request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(
        'Unable to geocode address at this time',
      );
    }
  }

  async geocodeByPlaceId(placeId: string): Promise<GeocodingResult | null> {
    const apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      this.logger.warn('GOOGLE_MAPS_API_KEY not configured — skipping geocode');
      return null;
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.get('https://maps.googleapis.com/maps/api/geocode/json', {
          params: { place_id: placeId, key: apiKey },
        }),
      );

      if (data.status !== 'OK' || !data.results?.length) {
        this.logger.warn(
          `Place ID geocode failed: ${data.status ?? 'UNKNOWN'}`,
        );
        return null;
      }

      const result = data.results[0];
      const { lat, lng } = result.geometry.location;

      return {
        latitude: lat,
        longitude: lng,
        formattedAddress: result.formatted_address,
      };
    } catch (error) {
      this.logger.error(
        `Place ID geocoding failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(
        'Unable to geocode place at this time',
      );
    }
  }
}