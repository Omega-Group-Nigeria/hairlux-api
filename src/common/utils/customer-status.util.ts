import { PrismaService } from '../../prisma/prisma.service';

/**
 * Shared customer lifecycle/value classification, used by both the Users
 * page (Website/App customers) and the Customer Contacts page (walk-ins
 * captured by staff) — same rules, same meaning, regardless of which
 * booking system (Booking vs SalonBooking) the underlying visits came
 * from.
 *
 * Per the CRM & Retention Engine spec, Lifecycle and Value are two
 * INDEPENDENT dimensions — a customer can be Lifecycle=AT_RISK and
 * Value=VIP at the same time. Value never overrides or replaces the
 * lifecycle label. Keep these as two separate functions/return values,
 * never merge them back into one enum.
 */

export type CustomerLifecycle = 'NEVER_VISITED' | 'NEW' | 'ACTIVE' | 'AT_RISK' | 'DORMANT' | 'INACTIVE';
export type CustomerValue = 'STANDARD' | 'PREMIUM' | 'VIP';

export interface CustomerLifecycleThresholds {
    newAccountAgeDays: number;
    newVisitCountThreshold: number;
    activeDaysThreshold: number;
    atRiskDaysThreshold: number;
    dormantDaysThreshold: number;
}

const DEFAULT_LIFECYCLE_THRESHOLDS: CustomerLifecycleThresholds = {
    newAccountAgeDays: 30,
    newVisitCountThreshold: 3,
    activeDaysThreshold: 30,
    atRiskDaysThreshold: 90,
    dormantDaysThreshold: 180,
};

export function classifyCustomerLifecycle(params: {
    lastVisitDate: Date | null;
    completedVisitCount: number;
    accountCreatedAt: Date;
    now?: Date;
    thresholds?: CustomerLifecycleThresholds;
}): CustomerLifecycle {
    const now = params.now ?? new Date();
    const t = params.thresholds ?? DEFAULT_LIFECYCLE_THRESHOLDS;
    const accountAgeDays = (now.getTime() - params.accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000);

    // New takes priority over Active (and over everything else) — an
    // account under the configured age with fewer than the configured
    // visit count is always New, regardless of how recent that handful of
    // visits was.
    if (accountAgeDays <= t.newAccountAgeDays && params.completedVisitCount < t.newVisitCountThreshold) return 'NEW';

    if (params.completedVisitCount === 0) {
        // Older than the New window and never actually completed a visit.
        return 'NEVER_VISITED';
    }

    const daysSinceLastVisit = params.lastVisitDate
        ? Math.floor((now.getTime() - params.lastVisitDate.getTime()) / (24 * 60 * 60 * 1000))
        : Infinity;

    if (daysSinceLastVisit <= t.activeDaysThreshold) return 'ACTIVE';
    if (daysSinceLastVisit <= t.atRiskDaysThreshold) return 'AT_RISK';
    if (daysSinceLastVisit <= t.dormantDaysThreshold) return 'DORMANT';
    return 'INACTIVE';
}

export function classifyCustomerValue(
    totalSpend: number,
    thresholds: { premiumSpendThreshold: number; vipSpendThreshold: number },
): CustomerValue {
    if (totalSpend >= thresholds.vipSpendThreshold) return 'VIP';
    if (totalSpend >= thresholds.premiumSpendThreshold) return 'PREMIUM';
    return 'STANDARD';
}

/**
 * Thresholds are admin-configurable (CustomerValueSettings, single row) —
 * never hard-code these. Callers doing bulk classification across many
 * customers should call this once and pass the result into
 * classifyCustomerValue for each customer, rather than querying per row.
 */
export async function getCustomerValueThresholds(prisma: PrismaService): Promise<{ premiumSpendThreshold: number; vipSpendThreshold: number }> {
    const row = await prisma.customerValueSettings.findFirst();
    return {
        premiumSpendThreshold: row ? Number(row.premiumSpendThreshold) : 50_000,
        vipSpendThreshold: row ? Number(row.vipSpendThreshold) : 200_000,
    };
}

/**
 * Lifecycle thresholds — same settings row as Value thresholds, admin-
 * configurable, never hard-coded. Callers doing bulk classification across
 * many customers should call this once and pass the result into
 * classifyCustomerLifecycle for each customer, same convention as
 * getCustomerValueThresholds.
 */
export async function getCustomerLifecycleThresholds(prisma: PrismaService): Promise<CustomerLifecycleThresholds> {
    const row = await prisma.customerValueSettings.findFirst();
    return {
        newAccountAgeDays: row ? row.newAccountAgeDays : 30,
        newVisitCountThreshold: row ? row.newVisitCountThreshold : 3,
        activeDaysThreshold: row ? row.activeDaysThreshold : 30,
        atRiskDaysThreshold: row ? row.atRiskDaysThreshold : 90,
        dormantDaysThreshold: row ? row.dormantDaysThreshold : 180,
    };
}

/**
 * Lightweight visit stats -- visitCount + lastVisitDate ONLY, nothing else
 * (no spend, branches, services). Built for CustomerLifecycleService's
 * daily transition-detection job, which needs to run cheaply across every
 * Customer/User rather than build the full display-grade stats object
 * findAllCustomers/findAllCustomerUsers compute. Sources from SalonBooking
 * (Customer's own booking history) -- a genuinely different table from the
 * one getUserVisitStats reads, matching the two customer types' real,
 * separate data sources rather than assuming they share one.
 */
export async function getCustomerVisitStats(prisma: PrismaService, customerIds: string[]): Promise<Map<string, { visitCount: number; lastVisitDate: Date | null }>> {
    const stats = new Map<string, { visitCount: number; lastVisitDate: Date | null }>();
    if (!customerIds.length) return stats;

    const bookings = await prisma.salonBooking.findMany({
        where: { customerId: { in: customerIds }, status: 'COMPLETED' },
        select: { customerId: true, bookingDate: true },
    });

    for (const b of bookings) {
        if (!b.customerId) continue;
        const s = stats.get(b.customerId) ?? { visitCount: 0, lastVisitDate: null };
        s.visitCount += 1;
        if (!s.lastVisitDate || b.bookingDate > s.lastVisitDate) s.lastVisitDate = b.bookingDate;
        stats.set(b.customerId, s);
    }
    return stats;
}

/**
 * Same shape and purpose as getCustomerVisitStats, but sources from
 * Booking (the legacy Web/App model), matching how findAllCustomerUsers
 * computes User visit stats -- User and Customer are genuinely different
 * tables with different booking histories, not the same data read twice.
 */
export async function getUserVisitStats(prisma: PrismaService, userIds: string[]): Promise<Map<string, { visitCount: number; lastVisitDate: Date | null }>> {
    const stats = new Map<string, { visitCount: number; lastVisitDate: Date | null }>();
    if (!userIds.length) return stats;

    const bookings = await prisma.booking.findMany({
        where: { userId: { in: userIds }, status: 'COMPLETED' },
        select: { userId: true, bookingDate: true },
    });

    for (const b of bookings) {
        const s = stats.get(b.userId) ?? { visitCount: 0, lastVisitDate: null };
        s.visitCount += 1;
        if (!s.lastVisitDate || b.bookingDate > s.lastVisitDate) s.lastVisitDate = b.bookingDate;
        stats.set(b.userId, s);
    }
    return stats;
}

/**
 * Dev Feedback Round 6, item #12: total spend for the Value dimension
 * (see classifyCustomerValue), computed from the same completed-visit
 * source getCustomerVisitStats already uses. A separate query rather
 * than folding into getCustomerVisitStats's existing return shape,
 * since most callers of visit stats don't need spend and shouldn't pay
 * for summing totalAmount on every call.
 */
export async function getCustomerTotalSpend(prisma: PrismaService, customerIds: string[]): Promise<Map<string, number>> {
    const spend = new Map<string, number>();
    if (!customerIds.length) return spend;

    const bookings = await prisma.salonBooking.findMany({
        where: { customerId: { in: customerIds }, status: 'COMPLETED' },
        select: { customerId: true, totalAmount: true },
    });

    for (const b of bookings) {
        if (!b.customerId) continue;
        spend.set(b.customerId, (spend.get(b.customerId) ?? 0) + Number(b.totalAmount));
    }
    return spend;
}

/** Same shape and purpose as getCustomerTotalSpend, but sources from Booking -- see getUserVisitStats's own note on why User/Customer stay separate queries. */
export async function getUserTotalSpend(prisma: PrismaService, userIds: string[]): Promise<Map<string, number>> {
    const spend = new Map<string, number>();
    if (!userIds.length) return spend;

    const bookings = await prisma.booking.findMany({
        where: { userId: { in: userIds }, status: 'COMPLETED' },
        select: { userId: true, totalAmount: true },
    });

    for (const b of bookings) {
        spend.set(b.userId, (spend.get(b.userId) ?? 0) + Number(b.totalAmount));
    }
    return spend;
}

/**
 * Fetches both settings dimensions in a single query — the common case for
 * every call site that classifies customers, since Value and Lifecycle
 * always live on the same settings row.
 */
export async function getCustomerClassificationThresholds(prisma: PrismaService): Promise<{
    value: { premiumSpendThreshold: number; vipSpendThreshold: number };
    lifecycle: CustomerLifecycleThresholds;
}> {
    const row = await prisma.customerValueSettings.findFirst();
    return {
        value: {
            premiumSpendThreshold: row ? Number(row.premiumSpendThreshold) : 50_000,
            vipSpendThreshold: row ? Number(row.vipSpendThreshold) : 200_000,
        },
        lifecycle: {
            newAccountAgeDays: row ? row.newAccountAgeDays : 30,
            newVisitCountThreshold: row ? row.newVisitCountThreshold : 3,
            activeDaysThreshold: row ? row.activeDaysThreshold : 30,
            atRiskDaysThreshold: row ? row.atRiskDaysThreshold : 90,
            dormantDaysThreshold: row ? row.dormantDaysThreshold : 180,
        },
    };
}