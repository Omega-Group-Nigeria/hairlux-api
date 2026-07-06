import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaystackService } from '../../../payment/paystack.service';
import { RedisService } from '../../../redis/redis.service';
import { BeauticianBankAccountService } from './beautician-bank-account.service';

describe('BeauticianBankAccountService', () => {
  let service: BeauticianBankAccountService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    beauticianProfile: { findUnique: jest.fn(), update: jest.fn() },
  };

  const mockPaystack = {
    listBanks: jest.fn(),
    resolveAccountNumber: jest.fn(),
    createTransferRecipient: jest.fn(),
  };

  const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setNx: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeauticianBankAccountService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get(BeauticianBankAccountService);
    jest.clearAllMocks();
  });

  describe('listBanks', () => {
    it('returns cached bank list without calling Paystack', async () => {
      const banks = [{ code: '058', name: 'GTBank', slug: 'gtb' }];
      mockRedis.get.mockResolvedValue(banks);

      await expect(service.listBanks()).resolves.toEqual(banks);
      expect(mockPaystack.listBanks).not.toHaveBeenCalled();
    });

    it('fetches from Paystack and caches for one week on miss', async () => {
      const banks = [{ code: '058', name: 'GTBank', slug: 'gtb' }];
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setNx.mockResolvedValue(true);
      mockPaystack.listBanks.mockResolvedValue(banks);

      await expect(service.listBanks()).resolves.toEqual(banks);

      expect(mockPaystack.listBanks).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'payout:banks:NGN',
        banks,
        7 * 24 * 60 * 60,
      );
      expect(mockRedis.del).toHaveBeenCalledWith('payout:banks:NGN:refresh');
    });
  });

  describe('resolveBankAccount', () => {
    it('returns resolved account details', async () => {
      mockPaystack.resolveAccountNumber.mockResolvedValue({
        account_number: '0123456789',
        account_name: 'ADA CHIOMA OKAFOR',
        bank_id: 9,
      });

      await expect(
        service.resolveBankAccount({
          bankCode: '058',
          accountNumber: '0123456789',
        }),
      ).resolves.toEqual({
        bankCode: '058',
        accountNumber: '0123456789',
        accountName: 'ADA CHIOMA OKAFOR',
      });
    });

    it('throws BadRequestException when Paystack resolution fails', async () => {
      mockPaystack.resolveAccountNumber.mockRejectedValue(
        new Error('Could not resolve account name'),
      );

      await expect(
        service.resolveBankAccount({
          bankCode: '058',
          accountNumber: '0123456789',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});