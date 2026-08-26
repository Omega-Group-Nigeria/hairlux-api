import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  Booking,
  BookingCancellationPolicyCategory,
  BookingCancellationPolicyRule,
  BookingStatus,
  BookingType,
  CancellationPolicyScenario,
  PaymentMethod,
  Prisma,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CANCELLATION_POLICY_CACHE_TTL_MS,
  DISPATCHED_BOOKING_STATUSES,
} from '../constants/cancellation-policy.constants';
import {
  getMinutesSinceBooking,
  getMinutesUntilService,
  getServiceDateTime,
  isNoShowReason,
} from '../utils/cancellation-time.utils';
import {
  CancellationPolicyRuleDto,
  UpdateCancellationPolicyDto,
} from '../dto/update-cancellation-policy.dto';

export type CancellationActor = 'customer' | 'admin';

export interface CancellationEvaluation {
  allowed: boolean;
  scenario: CancellationPolicyScenario | null;
  category: BookingCancellationPolicyCategory;
  refundPercent: number;
  forfeiturePercent: number;
  refundAmount: number;
  forfeitureAmount: number;
  denialReason?: string;
}

export interface CustomerCancellationEligibility {
  canCancel: boolean;
  scenario: CancellationPolicyScenario | null;
  category: BookingCancellationPolicyCategory | null;
  refundPercent: number;
  forfeiturePercent: number;
  estimatedRefundAmount: number;
  estimatedForfeitureAmount: number;
  denialReason?: string;
  /** Last moment the customer can cancel under the current policy (ISO 8601). */
  customerCancelDeadlineAt?: string | null;
}

export interface CustomerCancellationPolicyRule {
  scenario: CancellationPolicyScenario;
  windowMinutes: number | null;
  refundPercent: number;
  forfeiturePercent: number;
  customerCanCancel: boolean;
}

type PolicyRuleMap = Map<
  CancellationPolicyScenario,
  BookingCancellationPolicyRule
>;

const DEFAULT_WALK_IN_RULES: Array<
  Omit<BookingCancellationPolicyRule, 'id' | 'createdAt' | 'updatedAt'>
> = [
  {
    category: BookingCancellationPolicyCategory.WALK_IN_BRANCH,
    scenario: CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
    windowMinutes: 120,
    refundPercent: 100,
    forfeiturePercent: 0,
    customerCanCancel: true,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.WALK_IN_BRANCH,
    scenario: CancellationPolicyScenario.OUTSIDE_CANCELLATION_WINDOW,
    windowMinutes: null,
    refundPercent: 0,
    forfeiturePercent: 100,
    customerCanCancel: false,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.WALK_IN_BRANCH,
    scenario: CancellationPolicyScenario.NO_SHOW,
    windowMinutes: null,
    refundPercent: 50,
    forfeiturePercent: 50,
    customerCanCancel: false,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.WALK_IN_BRANCH,
    scenario: CancellationPolicyScenario.ADMIN_CANCELLATION,
    windowMinutes: null,
    refundPercent: 100,
    forfeiturePercent: 0,
    customerCanCancel: false,
    adminCanCancel: true,
  },
];

const DEFAULT_HOME_SERVICE_RULES: Array<
  Omit<BookingCancellationPolicyRule, 'id' | 'createdAt' | 'updatedAt'>
> = [
  {
    category: BookingCancellationPolicyCategory.HOME_SERVICE,
    scenario: CancellationPolicyScenario.GRACE_PERIOD,
    windowMinutes: 5,
    refundPercent: 100,
    forfeiturePercent: 0,
    customerCanCancel: true,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.HOME_SERVICE,
    scenario: CancellationPolicyScenario.AFTER_GRACE_PERIOD,
    windowMinutes: null,
    refundPercent: 0,
    forfeiturePercent: 100,
    customerCanCancel: false,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.HOME_SERVICE,
    scenario: CancellationPolicyScenario.DISPATCHED,
    windowMinutes: null,
    refundPercent: 40,
    forfeiturePercent: 60,
    customerCanCancel: false,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.HOME_SERVICE,
    scenario: CancellationPolicyScenario.NO_SHOW,
    windowMinutes: null,
    refundPercent: 40,
    forfeiturePercent: 60,
    customerCanCancel: false,
    adminCanCancel: true,
  },
  {
    category: BookingCancellationPolicyCategory.HOME_SERVICE,
    scenario: CancellationPolicyScenario.ADMIN_CANCELLATION,
    windowMinutes: null,
    refundPercent: 100,
    forfeiturePercent: 0,
    customerCanCancel: false,
    adminCanCancel: true,
  },
];

@Injectable()
export class BookingCancellationPolicyService {
  private cache: {
    expiresAt: number;
    byCategory: Map<BookingCancellationPolicyCategory, PolicyRuleMap>;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  clearCache() {
    this.cache = null;
  }

  async getPolicies() {
    const rules = await this.loadAllRules();
    return {
      walkInBranch: this.serializeCategoryRules(
        BookingCancellationPolicyCategory.WALK_IN_BRANCH,
        rules,
      ),
      homeService: this.serializeCategoryRules(
        BookingCancellationPolicyCategory.HOME_SERVICE,
        rules,
      ),
    };
  }

  /** Customer-facing policy (no admin-only fields). */
  async getCustomerPolicies(): Promise<{
    walkInBranch: CustomerCancellationPolicyRule[];
    homeService: CustomerCancellationPolicyRule[];
  }> {
    const policies = await this.getPolicies();
    const toCustomerRule = (
      rule: ReturnType<typeof this.serializeRule>,
    ): CustomerCancellationPolicyRule => ({
      scenario: rule.scenario,
      windowMinutes: rule.windowMinutes,
      refundPercent: rule.refundPercent,
      forfeiturePercent: rule.forfeiturePercent,
      customerCanCancel: rule.customerCanCancel,
    });

    return {
      walkInBranch: policies.walkInBranch.map(toCustomerRule),
      homeService: policies.homeService.map(toCustomerRule),
    };
  }

  async getCustomerEligibility(
    booking: Booking,
    now = new Date(),
  ): Promise<CustomerCancellationEligibility> {
    if (booking.status === BookingStatus.COMPLETED) {
      return {
        canCancel: false,
        scenario: null,
        category: this.resolvePolicyCategory(booking),
        refundPercent: 0,
        forfeiturePercent: 100,
        estimatedRefundAmount: 0,
        estimatedForfeitureAmount: Number(booking.totalAmount),
        denialReason: 'Completed bookings cannot be cancelled',
        customerCancelDeadlineAt: null,
      };
    }

    if (booking.status === BookingStatus.CANCELLED) {
      return {
        canCancel: false,
        scenario: null,
        category: this.resolvePolicyCategory(booking),
        refundPercent: 0,
        forfeiturePercent: 100,
        estimatedRefundAmount: 0,
        estimatedForfeitureAmount: Number(booking.totalAmount),
        denialReason: 'Booking is already cancelled',
        customerCancelDeadlineAt: null,
      };
    }

    const evaluation = await this.evaluateCancellation({
      booking,
      actor: 'customer',
      now,
    });

    const customerCancelDeadlineAt =
      await this.resolveCustomerCancelDeadline(booking, now);

    return {
      canCancel: evaluation.allowed,
      scenario: evaluation.scenario,
      category: evaluation.category,
      refundPercent: evaluation.refundPercent,
      forfeiturePercent: evaluation.forfeiturePercent,
      estimatedRefundAmount: evaluation.allowed ? evaluation.refundAmount : 0,
      estimatedForfeitureAmount: evaluation.forfeitureAmount,
      denialReason: evaluation.allowed ? undefined : evaluation.denialReason,
      customerCancelDeadlineAt,
    };
  }

  async updatePolicies(dto: UpdateCancellationPolicyDto) {
    if (dto.walkInBranch?.length) {
      await this.upsertCategoryRules(
        BookingCancellationPolicyCategory.WALK_IN_BRANCH,
        dto.walkInBranch,
      );
    }

    if (dto.homeService?.length) {
      await this.upsertCategoryRules(
        BookingCancellationPolicyCategory.HOME_SERVICE,
        dto.homeService,
      );
    }

    this.clearCache();
    return this.getPolicies();
  }

  async evaluateCancellation(input: {
    booking: Booking;
    actor: CancellationActor;
    reason?: string;
    isNoShow?: boolean;
    now?: Date;
  }): Promise<CancellationEvaluation> {
    const { booking, actor, reason, isNoShow, now = new Date() } = input;
    const category = this.resolvePolicyCategory(booking);
    const rules = await this.getRulesForCategory(category);
    const totalAmount = Number(booking.totalAmount);
    const noShow = isNoShow ?? isNoShowReason(reason);

    if (noShow) {
      return this.buildEvaluation(
        category,
        rules.get(CancellationPolicyScenario.NO_SHOW),
        totalAmount,
        actor,
        'No-show cancellation',
      );
    }

    if (this.isDispatched(booking)) {
      const dispatchedRule = rules.get(CancellationPolicyScenario.DISPATCHED);
      if (dispatchedRule) {
        return this.buildEvaluation(
          category,
          dispatchedRule,
          totalAmount,
          actor,
          'Beautician has been dispatched',
        );
      }
    }

    if (category === BookingCancellationPolicyCategory.WALK_IN_BRANCH) {
      return this.evaluateWalkIn(booking, actor, rules, totalAmount, now);
    }

    return this.evaluateHomeService(booking, actor, rules, totalAmount, now);
  }

  async processRefund(
    tx: Prisma.TransactionClient,
    booking: Booking,
    evaluation: CancellationEvaluation,
  ): Promise<void> {
    if (evaluation.refundAmount <= 0) {
      return;
    }

    if (
      booking.paymentMethod !== PaymentMethod.WALLET &&
      booking.paymentMethod !== PaymentMethod.MONNIFY
    ) {
      return;
    }

    const refundReference = `REFUND-${booking.id}`;
    const existingRefund = await tx.transaction.findFirst({
      where: { reference: refundReference },
    });

    if (existingRefund) {
      return;
    }

    const wallet = await tx.wallet.findUnique({
      where: { userId: booking.userId },
    });

    if (!wallet) {
      return;
    }

    await tx.wallet.update({
      where: { userId: booking.userId },
      data: {
        balance: {
          increment: evaluation.refundAmount,
        },
      },
    });

    await tx.transaction.create({
      data: {
        walletId: wallet.id,
        amount: evaluation.refundAmount,
        type: TransactionType.CREDIT,
        paymentMethod: PaymentMethod.WALLET,
        description: `Refund (${evaluation.refundPercent}%) for cancelled booking #${booking.id} [${evaluation.scenario}]`,
        reference: refundReference,
        status: TransactionStatus.COMPLETED,
      },
    });
  }

  private evaluateWalkIn(
    booking: Booking,
    actor: CancellationActor,
    rules: PolicyRuleMap,
    totalAmount: number,
    now: Date,
  ): CancellationEvaluation {
    const category = BookingCancellationPolicyCategory.WALK_IN_BRANCH;
    const withinRule = rules.get(
      CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
    );
    const windowMinutes = withinRule?.windowMinutes ?? 120;
    const minutesUntilService = getMinutesUntilService(booking, now);

    if (minutesUntilService >= windowMinutes) {
      return this.buildEvaluation(
        category,
        withinRule,
        totalAmount,
        actor,
        'Within customer cancellation window',
      );
    }

    if (actor === 'customer') {
      const outsideRule = rules.get(
        CancellationPolicyScenario.OUTSIDE_CANCELLATION_WINDOW,
      );
      return {
        allowed: false,
        scenario: CancellationPolicyScenario.OUTSIDE_CANCELLATION_WINDOW,
        category,
        refundPercent: outsideRule?.refundPercent ?? 0,
        forfeiturePercent: outsideRule?.forfeiturePercent ?? 100,
        refundAmount: 0,
        forfeitureAmount: totalAmount,
        denialReason: `Customer cancellation is only allowed at least ${windowMinutes} minutes before the appointment`,
      };
    }

    return this.buildEvaluation(
      category,
      rules.get(CancellationPolicyScenario.ADMIN_CANCELLATION),
      totalAmount,
      actor,
      'Admin cancellation outside customer window',
    );
  }

  private evaluateHomeService(
    booking: Booking,
    actor: CancellationActor,
    rules: PolicyRuleMap,
    totalAmount: number,
    now: Date,
  ): CancellationEvaluation {
    const category = BookingCancellationPolicyCategory.HOME_SERVICE;
    const graceRule = rules.get(CancellationPolicyScenario.GRACE_PERIOD);
    const graceMinutes = graceRule?.windowMinutes ?? 5;
    const minutesSinceBooking = getMinutesSinceBooking(booking, now);

    if (minutesSinceBooking <= graceMinutes) {
      return this.buildEvaluation(
        category,
        graceRule,
        totalAmount,
        actor,
        'Within grace period after booking',
      );
    }

    if (actor === 'customer') {
      return {
        allowed: false,
        scenario: CancellationPolicyScenario.AFTER_GRACE_PERIOD,
        category,
        refundPercent: 0,
        forfeiturePercent: 100,
        refundAmount: 0,
        forfeitureAmount: totalAmount,
        denialReason: `Customer cancellation is only allowed within ${graceMinutes} minutes of booking`,
      };
    }

    return this.buildEvaluation(
      category,
      rules.get(CancellationPolicyScenario.ADMIN_CANCELLATION),
      totalAmount,
      actor,
      'Admin cancellation after grace period',
    );
  }

  private buildEvaluation(
    category: BookingCancellationPolicyCategory,
    rule: BookingCancellationPolicyRule | undefined,
    totalAmount: number,
    actor: CancellationActor,
    context: string,
  ): CancellationEvaluation {
    if (!rule) {
      throw new BadRequestException(
        `Cancellation policy is not configured for ${category}`,
      );
    }

    const allowed =
      actor === 'admin' ? rule.adminCanCancel : rule.customerCanCancel;

    const refundPercent = rule.refundPercent;
    const forfeiturePercent = rule.forfeiturePercent;
    const refundAmount = this.calculatePortion(totalAmount, refundPercent);
    const forfeitureAmount = this.calculatePortion(totalAmount, forfeiturePercent);

    if (!allowed) {
      return {
        allowed: false,
        scenario: rule.scenario,
        category,
        refundPercent,
        forfeiturePercent,
        refundAmount: 0,
        forfeitureAmount: totalAmount,
        denialReason: `${context}: ${actor} cancellation is not permitted for this scenario`,
      };
    }

    return {
      allowed: true,
      scenario: rule.scenario,
      category,
      refundPercent,
      forfeiturePercent,
      refundAmount,
      forfeitureAmount,
    };
  }

  private calculatePortion(totalAmount: number, percent: number): number {
    const portion = (totalAmount * percent) / 100;
    return Math.round(portion * 100) / 100;
  }

  resolvePolicyCategory(
    booking: Pick<Booking, 'bookingType'>,
  ): BookingCancellationPolicyCategory {
    if (booking.bookingType === BookingType.WALK_IN) {
      return BookingCancellationPolicyCategory.WALK_IN_BRANCH;
    }

    return BookingCancellationPolicyCategory.HOME_SERVICE;
  }

  isDispatched(booking: Pick<Booking, 'status' | 'assignedBeauticianUserId'>): boolean {
    return (
      !!booking.assignedBeauticianUserId ||
      DISPATCHED_BOOKING_STATUSES.has(booking.status)
    );
  }

  private async resolveCustomerCancelDeadline(
    booking: Booking,
    now: Date,
  ): Promise<string | null> {
    const category = this.resolvePolicyCategory(booking);
    const rules = await this.getRulesForCategory(category);

    if (category === BookingCancellationPolicyCategory.HOME_SERVICE) {
      const graceRule = rules.get(CancellationPolicyScenario.GRACE_PERIOD);
      if (!graceRule?.windowMinutes || !graceRule.customerCanCancel) {
        return null;
      }

      const deadline = new Date(
        booking.createdAt.getTime() + graceRule.windowMinutes * 60_000,
      );
      return deadline > now ? deadline.toISOString() : null;
    }

    const withinRule = rules.get(
      CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW,
    );
    if (!withinRule?.windowMinutes || !withinRule.customerCanCancel) {
      return null;
    }

    const serviceAt = getServiceDateTime(booking);
    const deadline = new Date(
      serviceAt.getTime() - withinRule.windowMinutes * 60_000,
    );
    return deadline > now ? deadline.toISOString() : null;
  }

  private async getRulesForCategory(
    category: BookingCancellationPolicyCategory,
  ): Promise<PolicyRuleMap> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      const cached = this.cache.byCategory.get(category);
      if (cached) {
        return cached;
      }
    }

    const allRules = await this.loadAllRules();
    const ruleMap = allRules.get(category) ?? new Map();

    if (!this.cache || this.cache.expiresAt <= now) {
      this.cache = {
        expiresAt: now + CANCELLATION_POLICY_CACHE_TTL_MS,
        byCategory: allRules,
      };
    }

    return ruleMap;
  }

  private async loadAllRules(): Promise<
    Map<BookingCancellationPolicyCategory, PolicyRuleMap>
  > {
    await this.ensureDefaultRulesExist();

    const rules = await this.prisma.bookingCancellationPolicyRule.findMany({
      orderBy: [{ category: 'asc' }, { scenario: 'asc' }],
    });

    const byCategory = new Map<
      BookingCancellationPolicyCategory,
      PolicyRuleMap
    >();

    for (const rule of rules) {
      if (!byCategory.has(rule.category)) {
        byCategory.set(rule.category, new Map());
      }
      byCategory.get(rule.category)!.set(rule.scenario, rule);
    }

    return byCategory;
  }

  private async ensureDefaultRulesExist() {
    const count = await this.prisma.bookingCancellationPolicyRule.count();
    if (count > 0) {
      return;
    }

    await this.prisma.bookingCancellationPolicyRule.createMany({
      data: [...DEFAULT_WALK_IN_RULES, ...DEFAULT_HOME_SERVICE_RULES],
    });
  }

  private serializeCategoryRules(
    category: BookingCancellationPolicyCategory,
    rulesByCategory: Map<BookingCancellationPolicyCategory, PolicyRuleMap>,
  ) {
    const rules = rulesByCategory.get(category);
    if (!rules) {
      return [];
    }

    return Array.from(rules.values()).map((rule) => this.serializeRule(rule));
  }

  private serializeRule(rule: BookingCancellationPolicyRule) {
    return {
      id: rule.id,
      scenario: rule.scenario,
      windowMinutes: rule.windowMinutes,
      refundPercent: rule.refundPercent,
      forfeiturePercent: rule.forfeiturePercent,
      customerCanCancel: rule.customerCanCancel,
      adminCanCancel: rule.adminCanCancel,
    };
  }

  private async upsertCategoryRules(
    category: BookingCancellationPolicyCategory,
    rules: CancellationPolicyRuleDto[],
  ) {
    for (const rule of rules) {
      this.validateRule(rule);

      await this.prisma.bookingCancellationPolicyRule.upsert({
        where: {
          category_scenario: {
            category,
            scenario: rule.scenario,
          },
        },
        create: {
          category,
          scenario: rule.scenario,
          windowMinutes: rule.windowMinutes ?? null,
          refundPercent: rule.refundPercent,
          forfeiturePercent: rule.forfeiturePercent,
          customerCanCancel: rule.customerCanCancel,
          adminCanCancel: rule.adminCanCancel,
        },
        update: {
          windowMinutes: rule.windowMinutes ?? null,
          refundPercent: rule.refundPercent,
          forfeiturePercent: rule.forfeiturePercent,
          customerCanCancel: rule.customerCanCancel,
          adminCanCancel: rule.adminCanCancel,
        },
      });
    }
  }

  private validateRule(rule: CancellationPolicyRuleDto) {
    if (rule.refundPercent + rule.forfeiturePercent !== 100) {
      throw new BadRequestException(
        `Refund and forfeiture percentages must sum to 100 (scenario: ${rule.scenario})`,
      );
    }

    if (
      (rule.scenario === CancellationPolicyScenario.WITHIN_CANCELLATION_WINDOW ||
        rule.scenario === CancellationPolicyScenario.GRACE_PERIOD) &&
      (rule.windowMinutes == null || rule.windowMinutes < 1)
    ) {
      throw new BadRequestException(
        `windowMinutes is required for scenario ${rule.scenario}`,
      );
    }
  }
}
