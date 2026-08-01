import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { MonnifyService } from '../payment/monnify.service';
import { RedisService } from '../redis/redis.service';
import { WalletPushNotifier } from '../notifications/wallet/wallet-push.notifier';

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: {} },
        { provide: PaystackService, useValue: {} },
        { provide: MonnifyService, useValue: {} },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, defaultValue?: unknown) => defaultValue),
          },
        },
        { provide: RedisService, useValue: { get: jest.fn(), set: jest.fn() } },
        {
          provide: WalletPushNotifier,
          useValue: { notifyDepositSuccess: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
