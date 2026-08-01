import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { MonnifyService } from '../payment/monnify.service';
import { PaystackService } from '../payment/paystack.service';

describe('WalletController', () => {
  let controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [
        { provide: WalletService, useValue: {} },
        { provide: MonnifyService, useValue: {} },
        { provide: PaystackService, useValue: {} },
        {
          provide: getQueueToken('paystack-webhooks'),
          useValue: { add: jest.fn() },
        },
        {
          provide: getQueueToken('monnify-webhooks'),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
