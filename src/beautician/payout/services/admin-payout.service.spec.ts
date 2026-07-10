import { PayoutRequestStatus } from '@prisma/client';
import { AdminPayoutService } from './admin-payout.service';

describe('AdminPayoutService', () => {
  const mockPrisma = {
    payoutRequest: {
      findMany: jest.fn(),
    },
  };

  const mockBankAccountService = {
    resolveBankNamesByCode: jest.fn(),
  };

  const mockPaystackPayoutTransferService = {
    processPendingRequest: jest.fn(),
    approveTransfer: jest.fn(),
    listAwaitingApproval: jest.fn(),
  };

  const mockDailyPayoutLimitService = {
    getPoolStatus: jest.fn(),
  };

  let service: AdminPayoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminPayoutService(
      mockPrisma as never,
      mockBankAccountService as never,
      mockPaystackPayoutTransferService as never,
      mockDailyPayoutLimitService as never,
    );
  });

  it('lists payouts with bank names instead of bank codes', async () => {
    mockPrisma.payoutRequest.findMany.mockResolvedValue([
      {
        id: 'payout-1',
        amount: 25000,
        status: PayoutRequestStatus.PENDING,
        bankCode: '058',
        accountNumber: '0123456789',
        accountName: 'Ada Okafor',
        createdAt: new Date('2026-06-21T09:00:00.000Z'),
        user: {
          id: 'user-1',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
          phone: '+2348012345678',
        },
      },
    ]);
    mockBankAccountService.resolveBankNamesByCode.mockResolvedValue(
      new Map([['058', 'Guaranty Trust Bank']]),
    );

    const result = await service.listPayouts({ status: PayoutRequestStatus.PENDING });

    expect(mockPrisma.payoutRequest.findMany).toHaveBeenCalledWith({
      where: { status: PayoutRequestStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
    expect(result).toEqual([
      {
        id: 'payout-1',
        amount: 25000,
        status: PayoutRequestStatus.PENDING,
        bankName: 'Guaranty Trust Bank',
        accountNumber: '0123456789',
        accountName: 'Ada Okafor',
        createdAt: new Date('2026-06-21T09:00:00.000Z'),
        beautician: {
          id: 'user-1',
          firstName: 'Ada',
          lastName: 'Okafor',
          email: 'ada@example.com',
          phone: '+2348012345678',
        },
      },
    ]);
  });

  it('lists all payout statuses when status filter is omitted', async () => {
    mockPrisma.payoutRequest.findMany.mockResolvedValue([]);
    mockBankAccountService.resolveBankNamesByCode.mockResolvedValue(new Map());

    await service.listPayouts({});

    expect(mockPrisma.payoutRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('returns daily payout pool status', async () => {
    const pool = {
      limit: 500000,
      used: 120000,
      remaining: 380000,
      dayStartsAt: new Date('2026-07-09T23:00:00.000Z'),
      timezone: 'Africa/Lagos',
      unlimited: false,
    };
    mockDailyPayoutLimitService.getPoolStatus.mockResolvedValue(pool);

    await expect(service.getDailyPayoutPoolStatus()).resolves.toEqual(pool);
  });
});