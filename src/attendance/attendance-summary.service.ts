import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaveRequestType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffWorkCalendarService } from './staff-work-calendar.service';
import { watTodayDateStr } from '../common/utils/wat-time.util';

const LEAVE_DAY_TYPES: LeaveRequestType[] = [
    LeaveRequestType.ANNUAL_LEAVE,
    LeaveRequestType.SICK_LEAVE,
    LeaveRequestType.CASUAL_LEAVE,
    LeaveRequestType.DAY_OFF,
];

export interface MonthlyAttendanceSummary {
    staffId: string;
    staffName: string;
    periodStart: string;
    periodEnd: string;
    expectedWorkingDays: number;
    daysWorked: number;
    halfDaysWorked: number;
    approvedExtraWorkDays: number;
    pendingExtraWorkDays: number;
    approvedLeaveDays: number;
    publicHolidaysWorked: number;
    lateArrivals: number;
    earlyDepartures: number;
    absentDays: number;
}

@Injectable()
export class AttendanceSummaryService {
    constructor(
        private prisma: PrismaService,
        private workCalendarService: StaffWorkCalendarService,
    ) { }

    /**
     * HCS v1.0 Part B, Phase 5 — the monthly attendance summary, tying
     * together every prior phase's data. "Absent Days" deliberately isn't a
     * count of AttendanceStatus.ABSENT records: nothing in this system ever
     * automatically marks someone absent (that status only ever gets set via
     * a manual admin correction), so a status-based count would almost
     * always read as zero. Instead this derives absence as the gap between
     * "expected to work" and "accounted for" (attended, on approved leave,
     * or a holiday closure) — the only way to get a figure that actually
     * means something.
     */
    async getMonthlySummary(staffId: string, periodStartStr: string, periodEndStr: string): Promise<MonthlyAttendanceSummary> {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true, name: true, locationId: true } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const periodStart = new Date(periodStartStr);
        const periodEndExclusive = new Date(new Date(periodEndStr).getTime() + 24 * 60 * 60 * 1000);

        const [records, approvedLeave, businessExceptions, approvedExtraWorkDays, pendingExtraWorkDays] = await Promise.all([
            this.prisma.attendanceRecord.findMany({
                where: { staffId, date: { gte: periodStart, lt: periodEndExclusive } },
            }),
            this.prisma.leaveRequest.findMany({
                where: {
                    staffId,
                    status: 'APPROVED',
                    type: { in: LEAVE_DAY_TYPES },
                    startDate: { lt: periodEndExclusive },
                    endDate: { gte: periodStart },
                },
            }),
            // Both company-wide and this staff's own branch — either one means
            // "not really absent, the business/branch was closed that day."
            this.prisma.businessException.findMany({
                where: {
                    isClosed: true,
                    date: { gte: periodStart, lt: periodEndExclusive },
                    OR: [{ branchId: null }, { branchId: staff.locationId }],
                },
            }),
            this.prisma.attendanceRecord.count({
                where: {
                    staffId, date: { gte: periodStart, lt: periodEndExclusive },
                    status: 'EXTRA_WORK_DAY_PENDING', extraWorkDayApproval: 'APPROVED',
                },
            }),
            this.prisma.attendanceRecord.count({
                where: {
                    staffId, date: { gte: periodStart, lt: periodEndExclusive },
                    status: 'EXTRA_WORK_DAY_PENDING', extraWorkDayApproval: 'PENDING',
                },
            }),
        ]);

        const recordByDate = new Map(records.map((r) => [r.date.toISOString().slice(0, 10), r]));

        const leaveDates = new Set<string>();
        for (const leave of approvedLeave) {
            for (let d = new Date(leave.startDate); d <= leave.endDate; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
                leaveDates.add(d.toISOString().slice(0, 10));
            }
        }

        const holidayDates = new Set(businessExceptions.map((e) => e.date.toISOString().slice(0, 10)));

        let expectedWorkingDays = 0;
        let daysWorked = 0;
        let halfDaysWorked = 0;
        let absentDays = 0;

        const todayStr = watTodayDateStr(new Date());
        for (let d = new Date(periodStart); d < periodEndExclusive; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
            const dateStr = d.toISOString().slice(0, 10);
            if (dateStr > todayStr) break; // don't count future days as absent

            const effectiveDay = await this.workCalendarService.resolveEffectiveDay(staffId, dateStr);
            if (effectiveDay.dayType === 'OFF') continue; // not an expected working day at all — including the EXTRA_WORK_DAY case, handled separately above

            expectedWorkingDays += 1;

            const record = recordByDate.get(dateStr);
            if (record?.checkInAt) {
                if (effectiveDay.dayType === 'HALF_DAY') halfDaysWorked += 1;
                else daysWorked += 1;
            } else if (leaveDates.has(dateStr) || holidayDates.has(dateStr)) {
                // Accounted for — not absent.
            } else {
                absentDays += 1;
            }
        }

        const lateArrivals = records.filter((r) => r.status === 'LATE').length;
        const earlyDepartures = records.filter((r) => r.earlyDepartureMinutes != null).length;
        const publicHolidaysWorked = records.filter((r) => r.status === 'PUBLIC_HOLIDAY').length;

        return {
            staffId,
            staffName: staff.name,
            periodStart: periodStartStr,
            periodEnd: periodEndStr,
            expectedWorkingDays,
            daysWorked,
            halfDaysWorked,
            approvedExtraWorkDays,
            pendingExtraWorkDays,
            approvedLeaveDays: leaveDates.size,
            publicHolidaysWorked,
            lateArrivals,
            earlyDepartures,
            absentDays,
        };
    }

    /** Same summary, for every active staff member at once — used by the admin summary page. */
    async getMonthlySummaryForAllStaff(periodStartStr: string, periodEndStr: string, branchId?: string): Promise<MonthlyAttendanceSummary[]> {
        const staffList = await this.prisma.staff.findMany({
            where: { employmentStatus: 'ACTIVE', ...(branchId && { locationId: branchId }) },
            select: { id: true },
        });

        const summaries: MonthlyAttendanceSummary[] = [];
        for (const s of staffList) {
            summaries.push(await this.getMonthlySummary(s.id, periodStartStr, periodEndStr));
        }
        return summaries;
    }
}