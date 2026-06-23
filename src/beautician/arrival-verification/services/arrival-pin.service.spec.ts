import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from '../../../redis/redis.service';
import { ArrivalPinService } from './arrival-pin.service';

describe('ArrivalPinService', () => {
  let service: ArrivalPinService;

  const store = new Map<string, string>();
  const mockRedis = {
    set: jest.fn(async (key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
    }),
    get: jest.fn(async (key: string) => {
      const raw = store.get(key);
      return raw ? JSON.parse(raw) : null;
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach((key) => store.delete(key));
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    store.clear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArrivalPinService,
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ArrivalPinService>(ArrivalPinService);
  });

  it('generates a six digit pin', () => {
    const pin = service.generatePin();
    expect(pin).toMatch(/^\d{6}$/);
  });

  it('consumes pin only once', async () => {
    const record = {
      pin: '123456',
      bookingId: 'booking-1',
      beauticianUserId: 'beautician-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      geoAuditFlag: false,
      distanceMeters: 80,
    };

    await service.storePin('booking-1', record, 60);
    const first = await service.consumePin('booking-1');
    const second = await service.consumePin('booking-1');

    expect(first?.pin).toBe('123456');
    expect(second).toBeNull();
  });
});