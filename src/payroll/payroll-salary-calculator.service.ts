import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceSummaryService } from '../attendance/attendance-summary.service';

export interface SalaryCalculationResult {
    salaryEffectiveDate: Date | null;
    // fullMonthScheduledWorkdays stays null for COMMISSION -- there's no
    // "full calendar month" baseline to prorate a commission-only figure
    // against (unlike a fixed monthly baseSalary), only the applicable
    // range's own scheduled days. dailyRate/salaryEarned, by contrast,
    // ARE populated for COMMISSION now too -- see that branch's own
    // comment for why.
    fullMonthScheduledWorkdays: number | null;
    applicableScheduledWorkdays: number | null;
    missedWorkdays: number | null;
    approvedExtraWorkdaysCount: number | null;
    payableWorkdays: number | null;
    dailyRate: number | null;
    salaryEarned: number;
    extraWorkDayEarnings: number;
    staffHireDateSnapshot: Date | null;

    // SALARY_TO_COMMISSION only.
    cutoffDayUsed: number | null;
    cutoffClassification: string | null;
    salaryPeriodStart: Date | null;
    salaryPeriodEnd: Date | null;
    commissionPeriodStart: Date | null;
    commissionPeriodEnd: Date | null;
    transitionDate: Date | null;

    // Commission (COMMISSION and SALARY_PLUS_COMMISSION, and the
    // commission-eligible portion of SALARY_TO_COMMISSION).
    commissionEarned: number;

    // "Confirmed Work Days" -- the actual worked/payable days (scheduled -
    // missed + approved extra), as opposed to the full-month scheduled
    // denominator used above. Populated for every compensation type,
    // including COMMISSION (which otherwise has no workday breakdown at
    // all -- see calculateForStaff's COMMISSION branch).
    confirmedWorkdays: number | null;
    // Only set for SALARY_TO_COMMISSION when a commission sub-range
    // exists this period -- confirmedWorkdays for that sub-range
    // specifically, kept separate from the salary sub-range's count
    // (which lives in payableWorkdays/confirmedWorkdays) so the two can
    // be summed for effectiveDailyPay without double-counting.
    commissionPeriodConfirmedWorkdays: number | null;
    // Informational only -- per-day rate computed AFTER salaryEarned/
    // commissionEarned are already determined by the existing (unchanged)
    // proration logic above. Never used to derive actual pay:
    //  - SALARY / SALARY_PLUS_COMMISSION: Basic Salary / confirmedWorkdays
    //  - COMMISSION: Total Earned Commission / confirmedWorkdays
    //  - SALARY_TO_COMMISSION: (salaryEarned + commissionEarned) /
    //    (confirmedWorkdays + commissionPeriodConfirmedWorkdays)
    effectiveDailyPay: number | null;
}

interface DateRange {
    start: Date;
    end: Date;
}

/**
 * Payroll System Developer Implementation Guide, section 9. Pure,
 * side-effect-free -- deliberately isolated from the rest of the engine so
 * this one intricate piece of logic can be reasoned about (and verified
 * against the guide's own two worked examples) on its own.
 *
 * Given a hire date and cutoff day, determines the date the staff member's
 * pay switches from salary to commission permanently, then intersects that
 * against the current payroll period to produce the salary/commission
 * sub-ranges for THIS period specifically -- a single period can contain
 * both (guide: "A payroll period may contain both salary and commission").
 *
 * Verified against the guide's two examples:
 *  - Start Aug 10 (before 15th) -> transition Sep 1. August: all-salary.
 *    September: all-commission.
 *  - Start Aug 16 (on/after 15th) -> transition Sep 16. August: all-salary.
 *    September: split, salary 1-15, commission 16-30.
 */
export function resolveCutoffSplit(
    hireDate: Date,
    cutoffDay: number,
    periodStart: Date,
    periodEnd: Date,
): {
    transitionDate: Date;
    classification: 'BEFORE_CUTOFF' | 'ON_OR_AFTER_CUTOFF';
    salaryRange: DateRange | null;
    commissionRange: DateRange | null;
} {
    const hireDay = hireDate.getUTCDate();
    const hireYear = hireDate.getUTCFullYear();
    const hireMonth = hireDate.getUTCMonth(); // 0-indexed

    const classification: 'BEFORE_CUTOFF' | 'ON_OR_AFTER_CUTOFF' =
        hireDay < cutoffDay ? 'BEFORE_CUTOFF' : 'ON_OR_AFTER_CUTOFF';

    // "The following month" relative to the hire month, in both cases --
    // only the DAY within that month differs (the 1st vs. cutoffDay + 1).
    const followingMonthYear = hireMonth === 11 ? hireYear + 1 : hireYear;
    const followingMonth = hireMonth === 11 ? 0 : hireMonth + 1;
    const transitionDay = classification === 'BEFORE_CUTOFF' ? 1 : cutoffDay + 1;
    const transitionDate = new Date(Date.UTC(followingMonthYear, followingMonth, transitionDay));

    let salaryRange: DateRange | null = null;
    let commissionRange: DateRange | null = null;

    if (periodEnd < transitionDate) {
        // Entire period is still within the salary window.
        salaryRange = { start: periodStart, end: periodEnd };
    } else if (periodStart >= transitionDate) {
        // Entire period is past the transition -- commission only.
        commissionRange = { start: periodStart, end: periodEnd };
    } else {
        // Split: salary up to the day before transitionDate, commission from transitionDate onward.
        const salaryEnd = new Date(transitionDate.getTime() - 24 * 60 * 60 * 1000);
        salaryRange = { start: periodStart, end: salaryEnd };
        commissionRange = { start: transitionDate, end: periodEnd };
    }

    return { transitionDate, classification, salaryRange, commissionRange };
}

@Injectable()
export class PayrollSalaryCalculatorService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly attendanceSummaryService: AttendanceSummaryService,
    ) { }

    private dateStr(d: Date): string {
        return d.toISOString().slice(0, 10);
    }

    /**
     * Full-month scheduled workdays -- ALWAYS the whole calendar period,
     * regardless of hire date or any salary/commission split within it.
     * This is deliberately the same denominator in every case (guide,
     * section 4's mid-month-start example uses the full month's 21 days
     * as the denominator even though the employee only worked 16 of
     * them) -- what varies between staff/periods is the numerator
     * (payable workdays), never this denominator.
     */
    private async fullMonthScheduledWorkdays(staffId: string, periodStart: Date, periodEnd: Date): Promise<number> {
        const summary = await this.attendanceSummaryService.getMonthlySummary(
            staffId, this.dateStr(periodStart), this.dateStr(periodEnd),
        );
        return summary.expectedWorkingDays;
    }

    /**
     * Scheduled/missed/approved-extra workday counts for a specific
     * sub-range (the applicable range for this staff member this period,
     * or the salary/commission sub-range within it) -- the numerator
     * side of the calculation, as opposed to fullMonthScheduledWorkdays
     * (always the denominator).
     */
    private async rangeWorkdayBreakdown(staffId: string, range: DateRange) {
        const summary = await this.attendanceSummaryService.getMonthlySummary(
            staffId, this.dateStr(range.start), this.dateStr(range.end),
        );
        return {
            scheduledWorkdays: summary.expectedWorkingDays,
            missedWorkdays: summary.absentDays,
            approvedExtraWorkdays: summary.approvedExtraWorkDays,
        };
    }

    /**
     * Commission earned within a date range, from approved
     * SalonBookingCommission records only (guide, section 11: "only
     * approved eligible transactions generate commission" -- eligibility
     * itself is enforced earlier, at the point a commission record is
     * created against a CommissionPlan's eligibleServiceIds, not here).
     */
    private async commissionEarnedInRange(staffId: string, range: DateRange): Promise<number> {
        const agg = await this.prisma.salonBookingCommission.aggregate({
            where: {
                staffId,
                calculatedAt: { gte: range.start, lte: new Date(range.end.getTime() + 24 * 60 * 60 * 1000 - 1) },
                approvalStatus: 'APPROVED',
            },
            _sum: { amount: true },
        });
        return Number(agg._sum.amount ?? 0);
    }

    /**
     * Full calculation for one staff member for one payroll period.
     * Follows the guide's section 12 sequence: identify compensation
     * type, apply only the rules relevant to it, load schedule where
     * salary applies, calculate scheduled/applicable/payable workdays,
     * calculate salary, apply the cutoff rule (SALARY_TO_COMMISSION
     * only), calculate commission.
     */
    async calculateForStaff(
        staff: { id: string; hireDate: Date | null; compensationType: string; currentBaseSalary: unknown; commissionRate: unknown; commissionPlanId: string | null },
        periodStart: Date,
        periodEnd: Date,
        cutoffDay: number,
    ): Promise<SalaryCalculationResult> {
        const baseSalary = Number(staff.currentBaseSalary ?? 0);
        const compType = staff.compensationType;
        const hireDate = staff.hireDate;

        const result: SalaryCalculationResult = {
            salaryEffectiveDate: null,
            fullMonthScheduledWorkdays: null,
            applicableScheduledWorkdays: null,
            missedWorkdays: null,
            approvedExtraWorkdaysCount: null,
            payableWorkdays: null,
            dailyRate: null,
            salaryEarned: 0,
            extraWorkDayEarnings: 0,
            staffHireDateSnapshot: hireDate,
            cutoffDayUsed: null,
            cutoffClassification: null,
            salaryPeriodStart: null,
            salaryPeriodEnd: null,
            commissionPeriodStart: null,
            commissionPeriodEnd: null,
            transitionDate: null,
            commissionEarned: 0,
            confirmedWorkdays: null,
            commissionPeriodConfirmedWorkdays: null,
            effectiveDailyPay: null,
        };

        // Section 6: applicable range for THIS period, accounting for a
        // mid-month hire date -- used by every compensation type
        // (including COMMISSION, below) so a staff member hired mid-period
        // never gets pre-hire days counted against or for them.
        const applicableStart = hireDate && hireDate > periodStart ? hireDate : periodStart;
        if (hireDate && hireDate > periodEnd) {
            // Hired after this period ends entirely -- nothing payable yet.
            return result;
        }
        const applicableRange: DateRange = { start: applicableStart, end: periodEnd };

        // COMMISSION-only staff: no salary section applies (guide, section
        // 11: "Salary, start-date, and cutoff fields do not apply to
        // commission-only employees") -- fullMonthScheduledWorkdays and
        // salaryEffectiveDate stay null (no fixed monthly baseline exists
        // to prorate against). dailyRate/salaryEarned, however, ARE now
        // populated: commissionEarned is treated as "salary for the
        // month" -- spread evenly across this period's scheduled days to
        // get a daily rate, then applied to payableWorkdays, the exact
        // same structural role dailyRate/salaryEarned play for SALARY
        // (post the "we only want to pay for days worked" change) --
        // so gross pay, tax, and pension run through the SAME formula for
        // every compensation type, rather than commission-only silently
        // getting 0 pension/tax the way it did while dailyRate stayed null.
        if (compType === 'COMMISSION') {
            const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, applicableRange);
            result.applicableScheduledWorkdays = scheduledWorkdays;
            result.missedWorkdays = missedWorkdays;
            result.approvedExtraWorkdaysCount = approvedExtraWorkdays;

            const rawPayableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
            // Dev Feedback Round 9: capped at scheduledWorkdays -- this is
            // the actual root fix (capping salaryEarned alone, further
            // down, was incomplete). payroll-engine.service.ts's
            // computePayslipFigures computes entitledSalary independently,
            // as calc.dailyRate * calc.payableWorkdays directly -- it never
            // reads salaryEarned at all, only uses it afterward to derive
            // attendanceDeduction = entitledSalary - salaryEarned. So
            // capping salaryEarned alone left entitledSalary (and
            // therefore grossPay) still inflated by extra approved days,
            // with the difference showing up as a confusing POSITIVE
            // "Attendance" deduction line trying to claw back an inflation
            // that should never have happened in the first place. Capping
            // payableWorkdays itself, here, means every downstream reader
            // of calc.payableWorkdays (both this file's own salaryEarned
            // below AND entitledSalary in the other file) is correctly
            // bounded from the same single source, rather than needing a
            // separate cap in each place that happens to multiply by it.
            // Only ever caps the extra-days side -- missed days still
            // correctly reduce this below scheduledWorkdays.
            const payableWorkdays = Math.min(rawPayableWorkdays, scheduledWorkdays);
            result.payableWorkdays = payableWorkdays;
            result.confirmedWorkdays = payableWorkdays;

            result.commissionEarned = await this.commissionEarnedInRange(staff.id, applicableRange);
            result.dailyRate = scheduledWorkdays > 0 ? result.commissionEarned / scheduledWorkdays : 0;
            // Math.min(..., commissionEarned) kept as defense-in-depth --
            // with payableWorkdays now capped above, this should always
            // evaluate to exactly commissionEarned on its own in the
            // capped case (dailyRate * scheduledWorkdays === commissionEarned
            // by construction), never lower than the min() would already
            // produce, but costs nothing to leave in place.
            result.salaryEarned = Math.min(result.dailyRate * payableWorkdays, result.commissionEarned);
            // Rule 4: Daily Pay = Total Earned Commission / scheduled Work
            // Days -- kept on payableWorkdays specifically to match rules
            // 1-3's own already-confirmed convention (their own
            // effectiveDailyPay lines divide by payableWorkdays too, not
            // literal scheduledWorkdays), for consistency across all four.
            result.effectiveDailyPay = payableWorkdays > 0 ? result.commissionEarned / payableWorkdays : 0;
            return result;
        }
        
        // Section 6: the daily-rate DENOMINATOR (dailyRate, which actually
        // drives salaryEarned) is always the full month regardless of hire
        // date or attendance -- see fullMonthScheduledWorkdays doc comment.
        const fullMonthWorkdays = await this.fullMonthScheduledWorkdays(staff.id, periodStart, periodEnd);
        result.fullMonthScheduledWorkdays = fullMonthWorkdays;
        result.dailyRate = fullMonthWorkdays > 0 ? baseSalary / fullMonthWorkdays : 0;
        result.salaryEffectiveDate = periodStart; // frozen snapshot of "as of this period" -- the actual effective-date audit trail lives in StaffCompensationHistory

        if (compType === 'SALARY') {
            const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, applicableRange);
            result.applicableScheduledWorkdays = scheduledWorkdays;
            result.missedWorkdays = missedWorkdays;
            result.approvedExtraWorkdaysCount = approvedExtraWorkdays;
            const payableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
            result.payableWorkdays = payableWorkdays;
            result.confirmedWorkdays = payableWorkdays;
            result.salaryEarned = result.dailyRate * payableWorkdays;
            result.extraWorkDayEarnings = approvedExtraWorkdays * result.dailyRate;
            // Rule 1: Daily Pay = Basic Salary / Confirmed Work Days --
            // informational only, computed after salaryEarned above (which
            // keeps using the full-month-scheduled rate that actually
            // drives pay). Left at 0 when nothing was confirmed rather than
            // dividing by zero.
            result.effectiveDailyPay = payableWorkdays > 0 ? baseSalary / payableWorkdays : 0;
            return result;
        }

        if (compType === 'SALARY_PLUS_COMMISSION') {
            const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, applicableRange);
            result.applicableScheduledWorkdays = scheduledWorkdays;
            result.missedWorkdays = missedWorkdays;
            result.approvedExtraWorkdaysCount = approvedExtraWorkdays;
            const payableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
            result.payableWorkdays = payableWorkdays;
            result.confirmedWorkdays = payableWorkdays;
            result.salaryEarned = result.dailyRate * payableWorkdays;
            result.extraWorkDayEarnings = approvedExtraWorkdays * result.dailyRate;
            result.commissionEarned = await this.commissionEarnedInRange(staff.id, applicableRange);
            // Rule 3: Daily Pay = Basic Salary / Confirmed Work Days, same
            // as SALARY -- commission is added separately elsewhere
            // (payroll-engine.service.ts's grossPay), not folded into this
            // informational rate.
            result.effectiveDailyPay = payableWorkdays > 0 ? baseSalary / payableWorkdays : 0;
            return result;
        }

        // SALARY_TO_COMMISSION: the one path where a single period can
        // straddle both salary and commission.
        if (compType === 'SALARY_TO_COMMISSION') {
            if (!hireDate) {
                // No hire date on record -- can't apply the cutoff rule at
                // all. Treat as plain salary for the full applicable range
                // rather than silently guessing a transition date.
                const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, applicableRange);
                result.applicableScheduledWorkdays = scheduledWorkdays;
                result.missedWorkdays = missedWorkdays;
                result.approvedExtraWorkdaysCount = approvedExtraWorkdays;
                const payableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
                result.payableWorkdays = payableWorkdays;
                result.confirmedWorkdays = payableWorkdays;
                result.salaryEarned = result.dailyRate * payableWorkdays;
                result.extraWorkDayEarnings = approvedExtraWorkdays * result.dailyRate;
                result.effectiveDailyPay = payableWorkdays > 0 ? baseSalary / payableWorkdays : 0;
                return result;
            }

            const split = resolveCutoffSplit(hireDate, cutoffDay, applicableRange.start, applicableRange.end);
            result.cutoffDayUsed = cutoffDay;
            result.cutoffClassification = split.classification;
            result.transitionDate = split.transitionDate;

            if (split.salaryRange) {
                result.salaryPeriodStart = split.salaryRange.start;
                result.salaryPeriodEnd = split.salaryRange.end;
                const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, split.salaryRange);
                result.applicableScheduledWorkdays = scheduledWorkdays;
                result.missedWorkdays = missedWorkdays;
                result.approvedExtraWorkdaysCount = approvedExtraWorkdays;
                const payableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
                result.payableWorkdays = payableWorkdays;
                result.confirmedWorkdays = payableWorkdays;
                result.salaryEarned = result.dailyRate * payableWorkdays;
                result.extraWorkDayEarnings = approvedExtraWorkdays * result.dailyRate;
            }

            if (split.commissionRange) {
                result.commissionPeriodStart = split.commissionRange.start;
                result.commissionPeriodEnd = split.commissionRange.end;
                result.commissionEarned = await this.commissionEarnedInRange(staff.id, split.commissionRange);
                // Confirmed work days for the commission sub-range too --
                // needed (alongside the salary sub-range's confirmedWorkdays
                // above) as the denominator for rule 2's combined Daily Pay.
                const { scheduledWorkdays, missedWorkdays, approvedExtraWorkdays } = await this.rangeWorkdayBreakdown(staff.id, split.commissionRange);
                const commissionPayableWorkdays = scheduledWorkdays - missedWorkdays + approvedExtraWorkdays;
                result.commissionPeriodConfirmedWorkdays = commissionPayableWorkdays;
            }

            // Rule 2: combine salary-period pay and commission-period pay
            // as Total Pay, then divide by total confirmed work days across
            // BOTH sub-ranges -- informational only, same as the other
            // three rules; salaryEarned and commissionEarned above (already
            // correct) are what actually gets paid.
            const totalPay = result.salaryEarned + result.commissionEarned;
            const totalConfirmedWorkdays = (result.confirmedWorkdays ?? 0) + (result.commissionPeriodConfirmedWorkdays ?? 0);
            result.effectiveDailyPay = totalConfirmedWorkdays > 0 ? totalPay / totalConfirmedWorkdays : 0;

            return result;
        }

        return result;
    }
}