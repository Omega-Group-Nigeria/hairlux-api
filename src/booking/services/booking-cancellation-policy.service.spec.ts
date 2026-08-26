import {
  BookingCancellationPolicyCategory,
  BookingStatus,
  BookingType,
  CancellationPolicyScenario,
} from '@prisma/client';
import { BookingCancellationPolicyService } from './booking-cancellation-policy.service';

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    bookingType: BookingType.HOME_SERVICE,
    bookingDate: new Date('2026-09-01T10:00:00.000Z'),
    bookingTime: '10:00',
    status: BookingStatus.CONFIRMED,
    totalAmount: 10000,
    assignedBeauticianUserId: null,
    createdAt: new Date('2026-08-26T10:00:00.000Z'),
    ...overrides,
  } as any;
}

function makeRule(
  scenario: CancellationPolicyScenario,
  category: BookingCancellationPolicyCategory,
  overrides: Partial<{
    windowMinutes: number | null;
    refundPercent: number;
    forfeiturePercent: number;
    customerCanCancel: boolean;
    adminCanCancel: boolean;
  }> = {},
) {
  return {
    id: `rule-${scenario}`,
    category,
    scenario,
    windowMinutes: overrides.windowMinutes ?? null,
    refundPercent: overrides.refundPercent ?? 100,
    forfeiturePercent: overrides.forfeiturePercent ?? 0,
    customerCanCancel: overrides.customerCanCancel ?? true,
    adminCanCancel: overrides.adminCanCancel ?? true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('BookingCancellationPolicyService', () => {
  let service: BookingCancellationPolicyService;
  let prisma: {
    bookingCancellationPolicyRule: {
      count: jest.Mock;
      findMany: jest.Mock;
      createMany: jest.Mock;
      upsert: jest.Mock;
    };
    transaction: { findFirst: jest.Mock };
    wallet: { findUnique: jest.Mock; update: jest.Mock };
  };

  const walkInRules = [
    makeRule(
      CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
      BookingCancellationPolicyCategory.WALK_IN_BRANCH,
      { windowMinutes: 120, refundPercent: 100, forfeiturePercent: 0 },
    ),
    makeRule(
      CancellationPolicyScenario.OUTSIDE_CANCELLATION_WINDOW,
      BookingCancellationPolicyCategory.WALK_IN_BRANCH,
      {
        refundPercent: 0,
        forfeiturePercent: 100,
        customerCanCancel: false,
      },
    ),
    makeRule(
      CancellationPolicyScenario.NO_SHOW,
      BookingCancellationPolicyCategory.WALK_IN_BRANCH,
      { refundPercent: 50, forfeiturePercent: 50, customerCanCancel: false },
    ),
    makeRule(
      CancellationPolicyScenario.ADMIN_CANCELLATION,
      BookingCancellationPolicyCategory.WALK_IN_BRANCH,
      { customerCanCancel: false },
    ),
  ];

  const homeRules = [
    makeRule(
      CancellationPolicyScenario.GRACE_PERIOD,
      BookingCancellationPolicyCategory.HOME_SERVICE,
      { windowMinutes: 5, refundPercent: 100, forfeiturePercent: 0 },
    ),
    makeRule(
      CancellationPolicyScenario.AFTER_GRACE_PERIOD,
      BookingCancellationPolicyCategory.HOME_SERVICE,
      {
        refundPercent: 0,
        forfeiturePercent: 100,
        customerCanCancel: false,
      },
    ),
    makeRule(
      CancellationPolicyScenario.DISPATCHED,
      BookingCancellationPolicyCategory.HOME_SERVICE,
      {
        refundPercent: 40,
        forfeiturePercent: 60,
        customerCanCancel: false,
      },
    ),
    makeRule(
      CancellationPolicyScenario.NO_SHOW,
      BookingCancellationPolicyCategory.HOME_SERVICE,
      {
        refundPercent: 40,
        forfeiturePercent: 60,
        customerCanCancel: false,
      },
    ),
    makeRule(
      CancellationPolicyScenario.ADMIN_CANCELLATION,
      BookingCancellationPolicyCategory.HOME_SERVICE,
      { customerCanCancel: false },
    ),
  ];

  beforeEach(() => {
    prisma = {
      bookingCancellationPolicyRule: {
        count: jest.fn().mockResolvedValue(9),
        findMany: jest
          .fn()
          .mockResolvedValue([...walkInRules, ...homeRules]),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1' }),
        update: jest.fn(),
      },
    };

    service = new BookingCancellationPolicyService(prisma as any);
  });

  it('allows home service customer cancellation within grace period with full refund', async () => {
    const booking = makeBooking({
      createdAt: new Date('2026-08-26T10:02:00.000Z'),
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      now: new Date('2026-08-26T10:05:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.scenario).toBe(CancellationPolicyScenario.GRACE_PERIOD);
    expect(result.refundAmount).toBe(10000);
    expect(result.forfeitureAmount).toBe(0);
  });

  it('denies home service customer cancellation after grace period', async () => {
    const booking = makeBooking({
      createdAt: new Date('2026-08-26T10:00:00.000Z'),
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      now: new Date('2026-08-26T10:10:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.scenario).toBe(CancellationPolicyScenario.AFTER_GRACE_PERIOD);
    expect(result.refundAmount).toBe(0);
  });

  it('applies dispatched refund split for home service admin cancellation', async () => {
    const booking = makeBooking({
      createdAt: new Date('2026-08-26T09:00:00.000Z'),
      status: BookingStatus.EN_ROUTE,
      assignedBeauticianUserId: 'beautician-1',
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'admin',
      now: new Date('2026-08-26T10:10:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.scenario).toBe(CancellationPolicyScenario.DISPATCHED);
    expect(result.refundAmount).toBe(4000);
    expect(result.forfeitureAmount).toBe(6000);
  });

  it('allows walk-in customer cancellation within configured window', async () => {
    const booking = makeBooking({
      bookingType: BookingType.WALK_IN,
      bookingDate: new Date('2026-09-01T10:00:00.000Z'),
      bookingTime: '10:00',
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      now: new Date('2026-09-01T07:00:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.scenario).toBe(
      CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
    );
    expect(result.refundAmount).toBe(10000);
  });

  it('denies walk-in customer cancellation outside configured window', async () => {
    const booking = makeBooking({
      bookingType: BookingType.WALK_IN,
      bookingDate: new Date('2026-09-01T10:00:00.000Z'),
      bookingTime: '10:00',
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      now: new Date('2026-09-01T09:30:00.000Z'),
    });

    expect(result.allowed).toBe(false);
    expect(result.scenario).toBe(
      CancellationPolicyScenario.OUTSIDE_CANCELLATION_WINDOW,
    );
  });

  it('applies no-show policy for walk-in bookings', async () => {
    const booking = makeBooking({
      bookingType: BookingType.WALK_IN,
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'admin',
      isNoShow: true,
    });

    expect(result.allowed).toBe(true);
    expect(result.scenario).toBe(CancellationPolicyScenario.NO_SHOW);
    expect(result.refundAmount).toBe(5000);
    expect(result.forfeitureAmount).toBe(5000);
  });

  it('rejects policy updates when refund and forfeiture do not sum to 100', async () => {
    await expect(
      service.updatePolicies({
        homeService: [
          {
            scenario: CancellationPolicyScenario.GRACE_PERIOD,
            windowMinutes: 5,
            refundPercent: 90,
            forfeiturePercent: 5,
            customerCanCancel: true,
            adminCanCancel: true,
          },
        ],
      }),
    ).rejects.toThrow('must sum to 100');
  });

  it('exposes customer policy without admin-only fields', async () => {
    const policies = await service.getCustomerPolicies();

    expect(policies.homeService[0]).toEqual(
      expect.objectContaining({
        scenario: CancellationPolicyScenario.GRACE_PERIOD,
        windowMinutes: 5,
        customerCanCancel: true,
      }),
    );
    expect(policies.homeService[0]).not.toHaveProperty('adminCanCancel');
    expect(policies.homeService[0]).not.toHaveProperty('id');
  });

  it('returns customer eligibility with deadline for home service grace period', async () => {
    const createdAt = new Date('2026-08-26T10:00:00.000Z');
    const booking = makeBooking({
      createdAt,
      bookingType: BookingType.HOME_SERVICE,
    });

    const eligibility = await service.getCustomerEligibility(
      booking,
      new Date('2026-08-26T10:03:00.000Z'),
    );

    expect(eligibility.canCancel).toBe(true);
    expect(eligibility.estimatedRefundAmount).toBe(10000);
    expect(eligibility.customerCancelDeadlineAt).toBe(
      new Date(createdAt.getTime() + 5 * 60_000).toISOString(),
    );
  });

  it('allows customer grace cancellation even when beautician is dispatched', async () => {
    const booking = makeBooking({
      createdAt: new Date('2026-08-26T10:00:00.000Z'),
      status: BookingStatus.EN_ROUTE,
      assignedBeauticianUserId: 'beautician-1',
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      now: new Date('2026-08-26T10:03:00.000Z'),
    });

    expect(result.allowed).toBe(true);
    expect(result.scenario).toBe(CancellationPolicyScenario.GRACE_PERIOD);
    expect(result.refundAmount).toBe(10000);
  });

  it('does not treat customer cancel reason text as no-show', async () => {
    const booking = makeBooking({
      bookingType: BookingType.WALK_IN,
      bookingDate: new Date('2026-09-01T10:00:00.000Z'),
      bookingTime: '10:00',
    });

    const result = await service.evaluateCancellation({
      booking,
      actor: 'customer',
      reason: 'Previous no-show experience',
      now: new Date('2026-09-01T07:00:00.000Z'),
    });

    expect(result.scenario).toBe(
      CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
    );
    expect(result.refundAmount).toBe(10000);
  });

  it('omits cancel deadline when customer cannot cancel', async () => {
    const booking = makeBooking({
      createdAt: new Date('2026-08-26T09:00:00.000Z'),
      status: BookingStatus.EN_ROUTE,
      assignedBeauticianUserId: 'beautician-1',
    });

    const eligibility = await service.getCustomerEligibility(
      booking,
      new Date('2026-08-26T10:10:00.000Z'),
    );

    expect(eligibility.canCancel).toBe(false);
    expect(eligibility.customerCancelDeadlineAt).toBeNull();
  });

  it('throws when refund cannot be credited to a wallet', async () => {
    prisma.wallet.findUnique.mockResolvedValue(null);

    await expect(
      service.processRefund(
        prisma as any,
        makeBooking({ paymentMethod: 'WALLET' }),
        {
          allowed: true,
          scenario: CancellationPolicyScenario.GRACE_PERIOD,
          category: BookingCancellationPolicyCategory.HOME_SERVICE,
          refundPercent: 100,
          forfeiturePercent: 0,
          refundAmount: 10000,
          forfeitureAmount: 0,
        },
      ),
    ).rejects.toThrow('customer wallet not found');
  });
});
