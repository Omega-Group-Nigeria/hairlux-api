import { PrismaService } from '../../prisma/prisma.service';

/**
 * Branch-specific exception wins over a company-wide one for the same date
 * (more specific overrides general) — e.g. one branch closing early for a
 * local reason while the rest of the company runs normally. Falls back to
 * the company-wide row (branchId null) when no branch-specific one exists.
 *
 * Shared between the attendance engine and every booking-creation path so
 * "this day/branch is closed" means the same thing everywhere in the
 * system, rather than each consumer re-implementing its own (previously
 * inconsistent, in some cases entirely absent) check.
 */
export async function resolveBusinessException(prisma: PrismaService, locationId: string, dateStr: string) {
    const dayStart = new Date(dateStr);
    const dayEnd = new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000);

    const [branchSpecific, companyWide] = await Promise.all([
        prisma.businessException.findFirst({
            where: { date: { gte: dayStart, lt: dayEnd }, branchId: locationId },
        }),
        prisma.businessException.findFirst({
            where: { date: { gte: dayStart, lt: dayEnd }, branchId: null },
        }),
    ]);

    return branchSpecific ?? companyWide;
}