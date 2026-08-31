import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitReconciliationDto } from './dto/submit-reconciliation.dto';
/**
 * Nigeria (WAT) is a fixed UTC+1 offset year-round — no daylight saving —
 * matching the same approach already used in the attendance and
 * salon-booking services for the identical class of bug (bucketing "which
 * day did this happen on" needs to reason in WAT regardless of what
 * timezone the server process itself runs in).
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;

function watDateAtTime(dateStr: string, hhmm: string): Date {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`);
}

function toWatDateStr(date: Date): string {
    return new Date(date.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

export interface DaySummary {
    date: string;
    salonBookingRevenue: number;
    salonBookingCount: number;
    selfServiceBookingRevenue: number;
    selfServiceBookingCount: number;
    selfServiceWalletRevenue: number; // subset of the above, excluded from cash
    productSaleRevenue: number;
    productSaleCount: number;
    totalRevenue: number;
    expectedCash: number;
    stockReceived: number; // total units received
    stockTransferredIn: number;
    stockTransferredOut: number;
    reconciliation: { cashCounted: number; variance: number; notes: string | null; submittedAt: Date } | null;
}

@Injectable()
export class BranchFinanceService {
    private readonly logger = new Logger(BranchFinanceService.name);

    constructor(private prisma: PrismaService) { }

    /**
     * For the summary/read path: admin gets `null` (no branch filter — every
     * branch, matching how Booking Overview's own "all branches" mode omits
     * the filter entirely rather than looping branches) when they haven't
     * picked one. Everyone else gets the SET of branches they can access --
     * always including their own primary branch, plus (Dev Feedback Round
     * 4, item #25) any additional branches explicitly granted via
     * StaffManagedFinanceBranch. A single-branch user is just the
     * degenerate case of a set of one, so every downstream query filters
     * on "branchId IN (...)" uniformly rather than needing two code paths.
     */
    private async resolveBranchFilter(userId: string, isAdmin: boolean, requestedBranchId: string | undefined): Promise<string[] | null> {
        if (isAdmin) {
            if (!requestedBranchId) return null;
            const branch = await this.prisma.staffLocation.findUnique({ where: { id: requestedBranchId } });
            if (!branch) throw new NotFoundException('Branch not found');
            return [requestedBranchId];
        }

        const staff = await this.prisma.staff.findUnique({
            where: { userId },
            select: { id: true, locationId: true, additionalFinanceBranches: { select: { branchId: true } } },
        });
        if (!staff?.locationId) {
            throw new ForbiddenException('Your staff record has no assigned branch');
        }
        const accessible = [staff.locationId, ...staff.additionalFinanceBranches.map((b: { branchId: string }) => b.branchId)];

        if (requestedBranchId) {
            if (!accessible.includes(requestedBranchId)) {
                throw new ForbiddenException('You do not have access to this branch');
            }
            return [requestedBranchId];
        }
        return accessible;
    }

    /**
     * For the reconciliation-submit path: a cash count is inherently
     * per-branch, so "all branches"/a multi-branch set is never valid
     * here -- a multi-branch manager MUST explicitly say which branch
     * they're submitting for.
     */
    private async resolveBranchIdRequired(userId: string, isAdmin: boolean, requestedBranchId: string | undefined): Promise<string> {
        const resolved = await this.resolveBranchFilter(userId, isAdmin, requestedBranchId);
        if (!resolved || resolved.length === 0) {
            throw new BadRequestException('branchId is required to submit a cash count');
        }
        if (resolved.length > 1) {
            throw new BadRequestException('You manage more than one branch — specify which branch this submission is for');
        }
        return resolved[0];
    }

    async getDailySummary(userId: string, isAdmin: boolean, requestedBranchId: string | undefined, dateFromStr: string | undefined, dateToStr: string | undefined) {
        const branchIds = await this.resolveBranchFilter(userId, isAdmin, requestedBranchId);

        // No date filter given at all -> all time, matching Booking Overview's
        // own default when no date filter is applied. Gap-filling every empty
        // day only makes sense for an explicit, bounded range (see below).
        const hasExplicitRange = !!(dateFromStr || dateToStr);
        const dateFrom = dateFromStr || dateToStr;
        const dateTo = dateToStr || dateFromStr;
        if (dateFrom && dateTo && dateTo < dateFrom) {
            throw new BadRequestException('dateTo cannot be before dateFrom');
        }

        const rangeStart = dateFrom ? watDateAtTime(dateFrom, '00:00') : undefined;
        const rangeEndExclusive = dateTo ? new Date(watDateAtTime(dateTo, '00:00').getTime() + 24 * 60 * 60 * 1000) : undefined;
        const dateRangeFilter = (rangeStart || rangeEndExclusive)
            ? { ...(rangeStart && { gte: rangeStart }), ...(rangeEndExclusive && { lt: rangeEndExclusive }) }
            : undefined;
        const dateOnlyRangeFilter = (dateFrom || dateTo)
            ? { ...(dateFrom && { gte: new Date(dateFrom) }), ...(dateTo && { lt: new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000) }) }
            : undefined;

        const [salonBookings, selfServiceBookings, productSales, stockMovements, reconciliations] = await Promise.all([
            // Bucketed by completedAt (when the service actually finished), not
            // bookingDate (when it was scheduled for) -- a booking made for
            // tomorrow contributes nothing until it's actually completed, and if
            // it later gets rescheduled, the revenue lands on the day it was
            // actually rendered, not the day it was originally booked for. This
            // is what makes the "expected cash today" figure meaningful for
            // reconciling against today's actual cash count.
            this.prisma.salonBooking.findMany({
                where: {
                    status: 'COMPLETED',
                    ...(branchIds && { branchId: { in: branchIds } }),
                    completedAt: { not: null, ...(dateRangeFilter ?? {}) },
                },
                select: { totalAmount: true, completedAt: true },
            }),
            // Every self-service booking type is included here (not just WALK_IN)
            // -- this view is meant to capture all company credit/debit, not just
            // in-salon activity. branchId is nullable on this table (e.g. many
            // HOME_SERVICE bookings), so omitting the filter for "all branches"
            // correctly still counts those; filtering to one specific branch
            // naturally excludes bookings never attributed to any branch.
            this.prisma.booking.findMany({
                where: {
                    status: 'COMPLETED',
                    ...(branchIds && { branchId: { in: branchIds } }),
                    // serviceCompletedAt is only reliably populated going forward (a
                    // prior bug meant WALK_IN completions never set it -- now fixed
                    // at the source, but existing historical rows are still null).
                    // Fall back to updatedAt for those rather than silently excluding
                    // them, since the status flip to COMPLETED is what set updatedAt
                    // in the first place for that legacy path.
                    ...(dateRangeFilter && {
                        OR: [
                            { serviceCompletedAt: dateRangeFilter },
                            { serviceCompletedAt: null, updatedAt: dateRangeFilter },
                        ],
                    }),
                },
                select: { totalAmount: true, serviceCompletedAt: true, updatedAt: true, paymentMethod: true, branchId: true, bookingType: true },
            }),
            this.prisma.productSale.findMany({
                where: {
                    ...(branchIds && { branchId: { in: branchIds } }),
                    ...(dateRangeFilter && { createdAt: dateRangeFilter }),
                },
                select: { totalAmount: true, createdAt: true },
            }),
            this.prisma.stockMovement.findMany({
                where: {
                    type: { in: ['RECEIVED', 'TRANSFER_IN', 'TRANSFER_OUT'] },
                    ...(branchIds && { item: { branchId: { in: branchIds } } }),
                    ...(dateRangeFilter && { createdAt: dateRangeFilter }),
                },
                select: { type: true, quantityDelta: true, createdAt: true },
            }),
            this.prisma.dailyCashReconciliation.findMany({
                where: {
                    ...(branchIds && { branchId: { in: branchIds } }),
                    ...(dateOnlyRangeFilter && { date: dateOnlyRangeFilter }),
                },
            }),
        ]);

        this.logger.log(
            `getDailySummary: branchIds=${branchIds ? branchIds.join(',') : '(all branches)'} dateFrom=${dateFrom ?? '(none)'} dateTo=${dateTo ?? '(none)'} -> ` +
            `salonBookings=${salonBookings.length} selfServiceBookings=${selfServiceBookings.length} productSales=${productSales.length} stockMovements=${stockMovements.length}`,
        );

        if (selfServiceBookings.length > 0) {
            this.logger.log(
                `getDailySummary: selfServiceBookings detail -> ` +
                selfServiceBookings.map((b) => `{branchId=${b.branchId ?? 'null'}, bookingType=${b.bookingType}, amount=${b.totalAmount}}`).join(', '),
            );
        }

        // If a specific branch was requested and it came back completely empty
        // across every source, surface what branchIds actually exist on the
        // raw data — the fastest way to tell "there's genuinely no completed
        // activity for this branch yet" apart from "the branchId being
        // filtered on doesn't match what's actually stored on these records".
        if (branchIds && salonBookings.length === 0 && selfServiceBookings.length === 0 && productSales.length === 0) {
            const [sampleSalonBranches, sampleBookingBranches, sampleSaleBranches] = await Promise.all([
                this.prisma.salonBooking.findMany({ where: { status: 'COMPLETED' }, select: { branchId: true }, distinct: ['branchId'], take: 10 }),
                this.prisma.booking.findMany({ where: { status: 'COMPLETED' }, select: { branchId: true }, distinct: ['branchId'], take: 10 }),
                this.prisma.productSale.findMany({ select: { branchId: true }, distinct: ['branchId'], take: 10 }),
            ]);
            this.logger.warn(
                `getDailySummary: branchIds ${branchIds.join(',')} returned zero results across all sources. Distinct branchIds actually present -> ` +
                `salonBooking=[${sampleSalonBranches.map((b) => b.branchId).join(', ')}] ` +
                `booking=[${sampleBookingBranches.map((b) => b.branchId ?? 'null').join(', ')}] ` +
                `productSale=[${sampleSaleBranches.map((b) => b.branchId).join(', ')}]`,
            );
        }

        const byDate = new Map<string, DaySummary>();
        const ensureDay = (date: string): DaySummary => {
            let d = byDate.get(date);
            if (!d) {
                d = {
                    date,
                    salonBookingRevenue: 0, salonBookingCount: 0,
                    selfServiceBookingRevenue: 0, selfServiceBookingCount: 0, selfServiceWalletRevenue: 0,
                    productSaleRevenue: 0, productSaleCount: 0,
                    totalRevenue: 0, expectedCash: 0,
                    stockReceived: 0, stockTransferredIn: 0, stockTransferredOut: 0,
                    reconciliation: null,
                };
                byDate.set(date, d);
            }
            return d;
        };

        for (const b of salonBookings) {
            const day = ensureDay(toWatDateStr(b.completedAt as Date));
            const amount = Number(b.totalAmount);
            day.salonBookingRevenue += amount;
            day.salonBookingCount += 1;
        }

        for (const b of selfServiceBookings) {
            const day = ensureDay(toWatDateStr(b.serviceCompletedAt ?? b.updatedAt));
            const amount = Number(b.totalAmount);
            day.selfServiceBookingRevenue += amount;
            day.selfServiceBookingCount += 1;
            if (b.paymentMethod === 'WALLET') {
                day.selfServiceWalletRevenue += amount;
            }
        }

        for (const s of productSales) {
            const day = ensureDay(toWatDateStr(s.createdAt));
            day.productSaleRevenue += Number(s.totalAmount);
            day.productSaleCount += 1;
        }

        for (const m of stockMovements) {
            const day = ensureDay(toWatDateStr(m.createdAt));
            if (m.type === 'RECEIVED') day.stockReceived += m.quantityDelta;
            else if (m.type === 'TRANSFER_IN') day.stockTransferredIn += m.quantityDelta;
            else if (m.type === 'TRANSFER_OUT') day.stockTransferredOut += Math.abs(m.quantityDelta);
        }

        for (const r of reconciliations) {
            const day = ensureDay(r.date.toISOString().slice(0, 10));
            day.reconciliation = {
                cashCounted: Number(r.cashCounted),
                variance: Number(r.variance),
                notes: r.notes,
                submittedAt: r.submittedAt,
            };
        }

        // Fill in every date in the requested range, even ones with zero
        // activity, so the frontend can render a complete table without gaps --
        // but only for an explicit, bounded range. An all-time query could span
        // years; gap-filling that would generate a mostly-empty multi-year
        // table for no benefit, so all-time just shows the days that actually
        // had something happen.
        if (hasExplicitRange && dateFrom && dateTo) {
            for (let d = new Date(dateFrom); toWatDateStr(d) <= dateTo; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
                ensureDay(toWatDateStr(d));
            }
        }

        const days = Array.from(byDate.values())
            .filter((d) => (!dateFrom || d.date >= dateFrom) && (!dateTo || d.date <= dateTo))
            .map((d) => {
                d.totalRevenue = d.salonBookingRevenue + d.selfServiceBookingRevenue + d.productSaleRevenue;
                d.expectedCash = d.totalRevenue - d.selfServiceWalletRevenue;
                return d;
            })
            .sort((a, b) => a.date.localeCompare(b.date));

        const totals = days.reduce(
            (acc, d) => ({
                salonBookingRevenue: acc.salonBookingRevenue + d.salonBookingRevenue,
                selfServiceBookingRevenue: acc.selfServiceBookingRevenue + d.selfServiceBookingRevenue,
                selfServiceWalletRevenue: acc.selfServiceWalletRevenue + d.selfServiceWalletRevenue,
                productSaleRevenue: acc.productSaleRevenue + d.productSaleRevenue,
                totalRevenue: acc.totalRevenue + d.totalRevenue,
                expectedCash: acc.expectedCash + d.expectedCash,
                stockReceived: acc.stockReceived + d.stockReceived,
                stockTransferredIn: acc.stockTransferredIn + d.stockTransferredIn,
                stockTransferredOut: acc.stockTransferredOut + d.stockTransferredOut,
            }),
            { salonBookingRevenue: 0, selfServiceBookingRevenue: 0, selfServiceWalletRevenue: 0, productSaleRevenue: 0, totalRevenue: 0, expectedCash: 0, stockReceived: 0, stockTransferredIn: 0, stockTransferredOut: 0 },
        );

        return { branchIds, allBranches: branchIds === null, dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, totals, days };
    }

    /**
     * Dev Feedback Round 4, items #25-29: "the user can only access last
     * day" + "daily submission deadline (12pm lock)". The only valid
     * date is WAT-yesterday (the most recently fully-completed day --
     * today's revenue isn't final until closing, so same-day
     * reconciliation wouldn't make sense), and that window itself closes
     * at noon WAT today. Applied uniformly to admin too -- the spec
     * doesn't carve out an exception, and introducing an unstated one
     * would be a surprising, undocumented gap in the rule.
     */
    private async assertWithinSubmissionWindow(dateStr: string, now: Date) {
        const todayWat = toWatDateStr(now);
        const yesterdayWat = toWatDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));

        if (dateStr !== yesterdayWat) {
            throw new BadRequestException(
                `You can only submit for ${yesterdayWat} (yesterday) -- ${dateStr === todayWat ? "today's revenue isn't final yet" : 'this date is outside the submission window'}.`,
            );
        }

        const deadlineTime = (await this.prisma.branchFinanceSettings.findFirst())?.submissionDeadlineTime ?? '12:00';
        const deadlineToday = watDateAtTime(todayWat, deadlineTime);
        if (now.getTime() >= deadlineToday.getTime()) {
            throw new BadRequestException(`The submission window for ${yesterdayWat} closed at ${deadlineTime} today.`);
        }
    }

    /** Dev Feedback Round 6, item #17. */
    async getSettings() {
        const row = await this.prisma.branchFinanceSettings.findFirst({
            include: { updatedBy: { select: { id: true, name: true } } },
        });
        return { submissionDeadlineTime: row?.submissionDeadlineTime ?? '12:00', updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null };
    }

    async updateSettings(submissionDeadlineTime: string, actorUserId: string | undefined) {
        // Dev Feedback Round 6, item #22 uncovered this same mistake in a
        // sibling feature: req.user.id off the JWT is a User id, not a
        // Staff id -- updatedById's FK points at Staff. Resolved here
        // rather than passed straight through from the controller.
        const actorStaff = actorUserId
            ? await this.prisma.staff.findFirst({ where: { userId: actorUserId } })
            : null;

        const existing = await this.prisma.branchFinanceSettings.findFirst();
        if (existing) {
            return this.prisma.branchFinanceSettings.update({
                where: { id: existing.id },
                data: { submissionDeadlineTime, updatedById: actorStaff?.id },
            });
        }
        return this.prisma.branchFinanceSettings.create({
            data: { submissionDeadlineTime, updatedById: actorStaff?.id },
        });
    }

    async submitReconciliation(userId: string, isAdmin: boolean, dto: SubmitReconciliationDto) {
        const branchId = await this.resolveBranchIdRequired(userId, isAdmin, dto.branchId);
        await this.assertWithinSubmissionWindow(dto.date, new Date());

        // Snapshot the expected figures for this single date right now, rather
        // than relying on the caller to have fetched them separately — avoids a
        // stale or tampered expected figure being submitted alongside the count.
        const summary = await this.getDailySummary(userId, isAdmin, branchId, dto.date, dto.date);
        const day = summary.days[0] ?? { totalRevenue: 0, expectedCash: 0 };

        const staff = await this.prisma.staff.findUnique({ where: { userId }, select: { id: true } });

        const variance = dto.cashCounted - day.expectedCash;

        // Auto-detected above; a non-zero variance must never be
        // submitted silently -- notes here is the ONLY place this can be
        // enforced, since expectedCash (and therefore variance) is
        // computed server-side and isn't part of the request body at all.
        if (variance !== 0 && !dto.notes?.trim()) {
            throw new BadRequestException(
                `There is a variance of ${variance > 0 ? '+' : ''}${variance.toFixed(2)} between cash counted and expected cash -- a reason is required before this can be submitted.`,
            );
        }

        const record = await this.prisma.dailyCashReconciliation.upsert({
            where: { branchId_date: { branchId, date: new Date(dto.date) } },
            create: {
                branchId,
                date: new Date(dto.date),
                totalRevenue: day.totalRevenue,
                expectedCash: day.expectedCash,
                cashCounted: dto.cashCounted,
                variance,
                notes: dto.notes,
                submittedById: staff?.id,
            },
            update: {
                totalRevenue: day.totalRevenue,
                expectedCash: day.expectedCash,
                cashCounted: dto.cashCounted,
                variance,
                notes: dto.notes,
                submittedById: staff?.id,
                submittedAt: new Date(),
            },
        });

        return record;
    }
}