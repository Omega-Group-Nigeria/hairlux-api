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

export function classifyCustomerLifecycle(params: {
    lastVisitDate: Date | null;
    completedVisitCount: number;
    accountCreatedAt: Date;
    now?: Date;
}): CustomerLifecycle {
    const now = params.now ?? new Date();
    const accountAgeDays = (now.getTime() - params.accountCreatedAt.getTime()) / (24 * 60 * 60 * 1000);

    // New takes priority over Active (and over everything else) — an
    // account under 30 days old with fewer than 3 completed visits is
    // always New, regardless of how recent that handful of visits was.
    if (accountAgeDays <= 30 && params.completedVisitCount < 3) return 'NEW';

    if (params.completedVisitCount === 0) {
        // Older than 30 days and never actually completed a visit.
        return 'NEVER_VISITED';
    }

    const daysSinceLastVisit = params.lastVisitDate
        ? Math.floor((now.getTime() - params.lastVisitDate.getTime()) / (24 * 60 * 60 * 1000))
        : Infinity;

    if (daysSinceLastVisit <= 30) return 'ACTIVE';
    if (daysSinceLastVisit <= 90) return 'AT_RISK';
    if (daysSinceLastVisit <= 180) return 'DORMANT';
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