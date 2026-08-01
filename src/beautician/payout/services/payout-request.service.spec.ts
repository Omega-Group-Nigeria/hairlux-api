import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayoutMode, UserRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayoutRequestService } from './payout-request.service';
import { AutoPayoutService } from './auto-payout.service';
import { BeauticianBankAccountService } from './beautician-bank-account.service';
import { DailyPayoutLimitService } from './daily-payout-limit.service';

describe('PayoutRequestService', () => {
  let service: PayoutRequestService;

  const mockAutoPayout = {
    initiateWithdrawal: jest.fn(),
  };

  const mockBankAccount = {
    getPayoutDestination: jest.fn(async () => ({
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
      recipientCode: 'RCP_test',
    })),
  };

  const mockDailyPayoutLimit = {
    assertWithinDailyLimit: jest.fn(async () => undefined),
  };

  const mockPrisma = {
    user: {
      findUnique: jest.fn(async () => ({
        role: UserRole.BEAUTICIAN,
        beauticianProfile: { id: 'profile-1', isActive: true },
      })),
    },
    homeServiceSettings: {
      findFirst: jest.fn(async () => ({ payoutMode: PayoutMode.MANUAL })),
    },
    wallet: {
      findUnique: jest.fn(async () => ({ id: 'wallet-1', balance: 10000 })),
    },
    payoutRequest: {
      aggregate: jest.fn(async () => ({ _sum: { amount: 0 } })),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockBankNames = {
    getPayoutDestination: mockBankAccount.getPayoutDestination,
    resolveBankNamesByCode: jest.fn(async () => new Map([['058', 'Guaranty Trust Bank']])),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutRequestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AutoPayoutService, useValue: mockAutoPayout },
        { provide: BeauticianBankAccountService, useValue: mockBankNames },
        { provide: DailyPayoutLimitService, useValue: mockDailyPayoutLimit },
      ],
    }).compile();

    service = module.get<PayoutRequestService>(PayoutRequestService);
  });

  it('rejects non-beautician users', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      role: UserRole.USER,
      beauticianProfile: null,
    });

    await expect(
      service.createRequest('user-1', { amount: 1000 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects payout when available balance is insufficient', async () => {
    mockPrisma.payoutRequest.aggregate.mockResolvedValueOnce({
      _sum: { amount: 8000 },
    });

    await expect(
      service.createRequest('beautician-1', { amount: 5000 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates payout request when balance is sufficient', async () => {
    mockPrisma.payoutRequest.create.mockResolvedValueOnce({
      id: 'payout-1',
      amount: 5000,
      status: 'PENDING',
      bankCode: '058',
      accountNumber: '0123456789',
      accountName: 'ADA OKAFOR',
      createdAt: new Date(),
    });

    const result = await service.createRequest('beautician-1', {
      amount: 5000,
    });

    expect(result.id).toBe('payout-1');
    expect(mockPrisma.payoutRequest.create).toHaveBeenCalled();
    expect(mockBankAccount.getPayoutDestination).toHaveBeenCalled();
    expect(mockDailyPayoutLimit.assertWithinDailyLimit).toHaveBeenCalledWith(5000);
  });

  it('rejects when platform daily payout limit is exceeded', async () => {
    mockDailyPayoutLimit.assertWithinDailyLimit.mockRejectedValueOnce(
      new BadRequestException('Platform daily payout limit reached'),
    );

    await expect(
      service.createRequest('beautician-1', { amount: 5000 }),
    ).rejects.toThrow(BadRequestException);

    expect(mockPrisma.payoutRequest.create).not.toHaveBeenCalled();
    expect(mockAutoPayout.initiateWithdrawal).not.toHaveBeenCalled();
  });

  it('lists beautician payout requests with bank names', async () => {
    mockPrisma.payoutRequest.findMany.mockResolvedValueOnce([
      {
        id: 'payout-1',
        amount: 1000,
        status: 'CANCELLED',
        bankCode: '058',
        accountNumber: '7063693261',
        accountName: 'EZANA ZECARIAS',
        rejectionReason: 'Failed to initiate Paystack transfer',
        createdAt: new Date('2026-07-03T19:32:54.209Z'),
        processedAt: null,
      },
    ]);
    mockPrisma.payoutRequest.count.mockResolvedValueOnce(1);

    const result = await service.listMyPayouts('beautician-1', {
      status: undefined,
      page: 1,
      limit: 20,
    });

    expect(result.payouts).toEqual([
      {
        id: 'payout-1',
        amount: 1000,
        status: 'CANCELLED',
        bankName: 'Guaranty Trust Bank',
        accountNumber: '******3261',
        accountName: 'EZANA ZECARIAS',
        rejectionReason: 'Failed to initiate Paystack transfer',
        createdAt: new Date('2026-07-03T19:32:54.209Z'),
        processedAt: null,
      },
    ]);
    expect(result.pagination.total).toBe(1);
  });

  it('delegates to auto payout when payout mode is AUTO', async () => {
    mockPrisma.homeServiceSettings.findFirst.mockResolvedValueOnce({
      payoutMode: PayoutMode.AUTO,
    });
    mockAutoPayout.initiateWithdrawal.mockResolvedValueOnce({
      id: 'payout-auto-1',
      amount: 5000,
      status: 'PROCESSING',
      transferReference: 'PSTK-TRF-abc',
      createdAt: new Date(),
    });

    const result = await service.createRequest('beautician-1', {
      amount: 5000,
    });

    expect(mockDailyPayoutLimit.assertWithinDailyLimit).toHaveBeenCalledWith(5000);
    expect(mockAutoPayout.initiateWithdrawal).toHaveBeenCalledWith(
      'beautician-1',
      { amount: 5000 },
    );
    expect(result.id).toBe('payout-auto-1');
  });
});