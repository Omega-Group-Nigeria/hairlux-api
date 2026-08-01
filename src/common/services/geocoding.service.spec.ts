import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;

  const mockHttpService = { get: jest.fn() };
  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-api-key'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeocodingService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<GeocodingService>(GeocodingService);
  });

  it('returns coordinates for a valid geocode response', async () => {
    mockHttpService.get.mockReturnValue(
      of({
        data: {
          status: 'OK',
          results: [
            {
              formatted_address: 'Lagos, Nigeria',
              geometry: { location: { lat: 6.5244, lng: 3.3792 } },
            },
          ],
        },
      }),
    );

    const result = await service.geocodeAddress('Lagos, Nigeria');

    expect(result).toEqual({
      latitude: 6.5244,
      longitude: 3.3792,
      formattedAddress: 'Lagos, Nigeria',
    });
  });

  it('returns null when API key is not configured', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    const result = await service.geocodeAddress('Lagos, Nigeria');

    expect(result).toBeNull();
    expect(mockHttpService.get).not.toHaveBeenCalled();
  });
});