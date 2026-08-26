import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceStatus, LeaveRequestType, Prisma } from '@prisma/client';
import { LeaveService } from 'src/leave/leave.service';
import { haversineDistanceMeters } from '../common/utils/geo.util';
import { watDateAtTime, watTodayDateStr } from '../common/utils/wat-time.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { StaffWorkCalendarService } from './staff-work-calendar.service';

function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return (meters / 1000).toFixed(1) + 'km';
    }
    return Math.round(meters) + 'm';
}

@Injectable()
export class AttendanceService {
    private readonly logger = new Logger(AttendanceService.name);

    constructor(private prisma: PrismaService,
        private leaveService: LeaveService,
        private workCalendarService: StaffWorkCalendarService,
    ) { }
    /**
     * Branch-specific exception wins over a company-wide one for the same
     * date (more specific overrides general) — e.g. one branch closing
     * early for a local reason while the rest of the company runs
     * normally. Falls back to the company-wide row (branchId null) when no
     * branch-specific one exists, matching the original, unscoped behavior.
     */
    private async resolveBusinessException(locationId: string, dateStr: string) {
        const dayStart = new Date(dateStr);
        const dayEnd = new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000);

        const [branchSpecific, companyWide] = await Promise.all([
            this.prisma.businessException.findFirst({
                where: { date: { gte: dayStart, lt: dayEnd }, branchId: locationId },
            }),
            this.prisma.businessException.findFirst({
                where: { date: { gte: dayStart, lt: dayEnd }, branchId: null },
            }),
        ]);

        return branchSpecific ?? companyWide;
    }

    async clockIn(staffId: string, dto: ClockInDto) {
        const staff = await this.prisma.staff.findUnique({
            where: { id: staffId },
            include: { location: true },
        });
        if (!staff) throw new NotFoundException('Staff record not found');

        const now = new Date();
        const today = watTodayDateStr(now);

        const existing = await this.prisma.attendanceRecord.findUnique({
            where: { staffId_date: { staffId, date: new Date(today) } },
        });
        if (existing) {
            throw new BadRequestException('Already clocked in today');
        }

        if (!staff.location.gpsLat || !staff.location.gpsLng) {
            throw new BadRequestException('This branch has no GPS coordinates configured — contact an administrator');
        }

        const distanceMeters = haversineDistanceMeters(
            dto.lat, dto.lng,
            Number(staff.location.gpsLat), Number(staff.location.gpsLng),
        );

        if (distanceMeters > (staff.location.approvedRadiusMeters ?? 100)) {
            throw new BadRequestException(
                `You are ${formatDistance(distanceMeters)} from ${staff.location.name} — clock-in requires you to be on-site`,
            );
        }

        // Public holiday check — a company-wide closure takes priority over
        // everything, including an individual's own calendar; a
        // branch-specific closure takes priority over that too, but only
        // for staff at that branch.
        const holidayException = await this.resolveBusinessException(staff.locationId, today);

        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        let lateMinutes: number | null = null;
        let latePenaltyAmount: number | null = null;

        if (holidayException?.isClosed) {
            status = AttendanceStatus.PUBLIC_HOLIDAY;
        } else {
            const effectiveDay = await this.workCalendarService.resolveEffectiveDay(staffId, today);

            // An exception can override the resume time without fully closing the
            // day (e.g. shortened holiday hours) — exception time wins when present,
            // over both the global default AND this staff member's own calendar,
            // since a shortened company holiday applies uniformly to everyone.
            const openTime = holidayException?.openTime ?? effectiveDay.resumeTime;

            // Whether the business is open at all is still governed by the holiday
            // exception when one exists; otherwise it comes down to whether THIS
            // staff member's own calendar has them working today at all — a
            // half-day still counts as "expected", only a genuine OFF day doesn't.
            const staffExpectedToday = holidayException
                ? !holidayException.isClosed
                : effectiveDay.dayType !== 'OFF';

            if (!staffExpectedToday) {
                // Clocking in on a day their own calendar says is OFF — this isn't
                // ordinary attendance and shouldn't be scored as late/on-time at
                // all (HCS v1.0 Part B, Section 2/4). It's recorded as pending
                // approval; approving it and folding it into payroll is Phase 3.
                status = AttendanceStatus.EXTRA_WORK_DAY_PENDING;
            } else if (openTime) {
                const scheduledStart = watDateAtTime(today, openTime);

                const graceMinutes = staff.lateGracePeriodOverride ?? staff.location.lateGracePeriodMinutes;
                const graceDeadline = new Date(scheduledStart.getTime() + graceMinutes * 60000);

                if (now > graceDeadline) {
                    // Only mark LATE if there's no approved late-arrival permission covering today —
                    // the SRS's "suppress the penalty for that specific instance" rule.
                    const approvedPermission = await this.leaveService.findApprovedPermissionForToday(
                        staffId, LeaveRequestType.PERMISSION_LATE_ARRIVAL, new Date(today),
                    );

                    if (!approvedPermission) {
                        status = AttendanceStatus.LATE;
                        lateMinutes = Math.round((now.getTime() - scheduledStart.getTime()) / 60000);
                        latePenaltyAmount = await this.calculateLatePenalty(lateMinutes, graceMinutes);
                    }
                }
            }
        }

        return this.prisma.attendanceRecord.create({
            data: {
                staffId,
                locationId: staff.locationId,
                date: new Date(today),
                checkInAt: now,
                checkInLat: dto.lat,
                checkInLng: dto.lng,
                status,
                lateMinutes,
                latePenaltyAmount,
                ...(status === AttendanceStatus.EXTRA_WORK_DAY_PENDING && { extraWorkDayApproval: 'PENDING' }),
            },
        });
    }

    /**
     * Charges only for minutes beyond the grace period, not the full
     * lateMinutes figure (which is measured from scheduled start, grace
     * period included) — otherwise the grace period wouldn't actually mean
     * anything. Returns null when the feature is off or nothing's owed.
     */
    private async calculateLatePenalty(lateMinutes: number, graceMinutes: number): Promise<number | null> {
        const settings = await this.getLatePenaltySettings();
        if (!settings?.isActive) return null;

        const penalizedMinutes = Math.max(0, lateMinutes - graceMinutes);
        if (penalizedMinutes === 0) return null;

        return penalizedMinutes * Number(settings.amountPerMinute);
    }

    /**
     * Absent-day fee — that day's expected working minutes × the same
     * per-minute rate late penalties use, computed and frozen the moment
     * ABSENT is recorded (never recomputed later at payroll time, matching
     * calculateLatePenalty's freeze-at-check-in convention). Returns null
     * when the penalty system is off or no rate is configured, meaning the
     * absence is deliberately uncharged rather than falling back to some
     * other number. A date with no resolvable resume/close time (shouldn't
     * normally happen, since ABSENT is only ever recorded for days someone
     * was actually expected to work) also returns null rather than throwing.
     */
    private async calculateAbsentFee(staffId: string, dateStr: string): Promise<number | null> {
        const settings = await this.getLatePenaltySettings();
        if (!settings?.isActive) return null;

        const effectiveDay = await this.workCalendarService.resolveEffectiveDay(staffId, dateStr);
        if (!effectiveDay.resumeTime || !effectiveDay.closingTime) return null;

        const [resumeHour, resumeMinute] = effectiveDay.resumeTime.split(':').map(Number);
        const [closeHour, closeMinute] = effectiveDay.closingTime.split(':').map(Number);
        const expectedMinutes = (closeHour * 60 + closeMinute) - (resumeHour * 60 + resumeMinute);
        if (expectedMinutes <= 0) return null;

        return expectedMinutes * Number(settings.amountPerMinute);
    }

    async getLatePenaltySettings() {
        return this.prisma.latePenaltySettings.findFirst();
    }

    async upsertLatePenaltySettings(dto: { isActive?: boolean; amountPerMinute?: number }) {
        const existing = await this.prisma.latePenaltySettings.findFirst();

        return existing
            ? this.prisma.latePenaltySettings.update({ where: { id: existing.id }, data: dto })
            : this.prisma.latePenaltySettings.create({
                data: {
                    isActive: dto.isActive ?? false,
                    amountPerMinute: dto.amountPerMinute ?? 0,
                },
            });
    }

    async clockOut(staffId: string, dto: ClockOutDto) {
        const today = watTodayDateStr(new Date());

        const record = await this.prisma.attendanceRecord.findUnique({
            where: { staffId_date: { staffId, date: new Date(today) } },
            include: { staff: { include: { location: true } } },
        });

        if (!record) {
            throw new BadRequestException('No clock-in found for today — clock in first');
        }
        if (record.checkOutAt) {
            throw new BadRequestException('Already clocked out today');
        }

        // Checkout is capped at 10pm WAT — past that, the window has closed
        // for the day. This is intentionally NOT treated as "just late": a
        // missed checkout by this point means the day resolves to ABSENT
        // via the next morning's markAbsencesForYesterday job, not a normal
        // (if overdue) checkout here.
        const todayForCutoff = watTodayDateStr(new Date());
        const checkoutCutoff = watDateAtTime(todayForCutoff, '22:00');
        if (new Date() > checkoutCutoff) {
            throw new BadRequestException(
                'Checkout is no longer available for today — the 10:00 PM cutoff has passed. Today will be recorded as Absent.',
            );
        }

        const staffLocation = record.staff.location;
        if (staffLocation.gpsLat && staffLocation.gpsLng) {
            const distanceMeters = haversineDistanceMeters(
                dto.lat, dto.lng,
                Number(staffLocation.gpsLat), Number(staffLocation.gpsLng),
            );
            if (distanceMeters > (staffLocation.approvedRadiusMeters ?? 100)) {
                throw new BadRequestException(
                    `You are ${formatDistance(distanceMeters)} from ${staffLocation.name} — clock-out requires you to be on-site`,
                );
            }
        }

        const now = new Date();
        const todayStr = record.date.toISOString().slice(0, 10);

        let overtimeMinutes: number | null = null;
        let earlyDepartureMinutes: number | null = null;

        if (record.status === AttendanceStatus.EXTRA_WORK_DAY_PENDING) {
            // Clocked in on a day their calendar said was OFF — there's no
            // scheduled closing time to enforce or measure against, so
            // checkout is unrestricted and no overtime/early-departure figures
            // apply here either, matching clockIn's "no penalties" treatment.
        } else {
            const holidayException = await this.resolveBusinessException(record.locationId, todayStr);
            const effectiveDay = await this.workCalendarService.resolveEffectiveDay(staffId, todayStr);

            const closeTime = holidayException?.closeTime ?? effectiveDay.closingTime;
            const dayIsOpen = holidayException ? !holidayException.isClosed : effectiveDay.dayType !== 'OFF';

            if (dayIsOpen && closeTime) {
                const scheduledEnd = watDateAtTime(todayStr, closeTime);

                if (now < scheduledEnd) {
                    // Checking out before closing time — only allowed with an approved
                    // early-departure permission covering today, and only from that
                    // permission's approved start time onward.
                    const approvedPermission = await this.leaveService.findApprovedPermissionForToday(
                        staffId, LeaveRequestType.PERMISSION_EARLY_DEPARTURE, new Date(todayStr),
                    );

                    if (!approvedPermission) {
                        throw new BadRequestException(
                            `Checkout is not allowed before closing time (${closeTime}) without an approved early departure permission for today`,
                        );
                    }

                    if (approvedPermission.startTime) {
                        const permittedFrom = watDateAtTime(todayStr, approvedPermission.startTime);

                        if (now < permittedFrom) {
                            throw new BadRequestException(
                                `Your approved early departure is not until ${approvedPermission.startTime}`,
                            );
                        }
                    }

                    earlyDepartureMinutes = Math.round((scheduledEnd.getTime() - now.getTime()) / 60000);
                } else if (now > scheduledEnd) {
                    overtimeMinutes = Math.round((now.getTime() - scheduledEnd.getTime()) / 60000);
                }
            }
        }

        return this.prisma.attendanceRecord.update({
            where: { id: record.id },
            data: {
                checkOutAt: now,
                checkOutLat: dto.lat,
                checkOutLng: dto.lng,
                overtimeMinutes,
                earlyDepartureMinutes,
            },
        });
    }

    async findAllAdmin(query: QueryAttendanceDto) {
        const { staffId, locationId, date, status, from, to, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.AttendanceRecordWhereInput = {
            ...(staffId && { staffId }),
            ...(locationId && { locationId }),
            ...(status && { status }),
            ...(date
                ? { date: new Date(date) }
                : (from || to) && {
                    date: {
                        ...(from && { gte: new Date(from) }),
                        ...(to && { lte: new Date(to) }),
                    },
                }),
        };

        const [records, total] = await Promise.all([
            this.prisma.attendanceRecord.findMany({
                where,
                include: { staff: { select: { id: true, name: true, staffCode: true } } },
                orderBy: { date: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.attendanceRecord.count({ where }),
        ]);

        return {
            data: records,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async correctRecord(recordId: string, dto: CorrectAttendanceDto, adjustedById: string) {
        const record = await this.prisma.attendanceRecord.findUnique({ where: { id: recordId } });
        if (!record) {
            throw new NotFoundException('Attendance record not found');
        }

        // Recompute the frozen fee whenever a correction lands the record on
        // ABSENT (whether it's newly set to ABSENT here, or was already
        // ABSENT and something else about the record is being corrected) —
        // and clear it if a correction moves the record OFF ABSENT, since a
        // stale fee shouldn't survive a status change away from Absent.
        const resultingStatus = dto.status ?? record.status;
        const dateStr = record.date.toISOString().slice(0, 10);
        const absentFeeAmount = resultingStatus === AttendanceStatus.ABSENT
            ? await this.calculateAbsentFee(record.staffId, dateStr)
            : null;

        return this.prisma.attendanceRecord.update({
            where: { id: recordId },
            data: {
                ...(dto.checkInAt !== undefined && { checkInAt: new Date(dto.checkInAt) }),
                ...(dto.checkOutAt !== undefined && { checkOutAt: new Date(dto.checkOutAt) }),
                ...(dto.status !== undefined && { status: dto.status }),
                absentFeeAmount,
                isManuallyAdjusted: true,
                adjustmentReasonCategory: dto.reasonCategory,
                adjustmentReason: dto.reason,
                adjustedById,
            },
        });
    }

    // Handles the edge case from clockIn: staff whose battery died, or who forgot
    // to clock in at all — admin creates the record from scratch rather than correcting one.
    async createManualRecord(staffId: string, dto: CorrectAttendanceDto & { date: string; locationId: string }, adjustedById: string) {
        const existing = await this.prisma.attendanceRecord.findUnique({
            where: { staffId_date: { staffId, date: new Date(dto.date) } },
        });
        if (existing) {
            throw new BadRequestException('A record already exists for this staff member on this date — use the correction endpoint instead');
        }

        const finalStatus = dto.status ?? AttendanceStatus.PRESENT;
        const absentFeeAmount = finalStatus === AttendanceStatus.ABSENT
            ? await this.calculateAbsentFee(staffId, dto.date)
            : null;

        return this.prisma.attendanceRecord.create({
            data: {
                staffId,
                locationId: dto.locationId,
                date: new Date(dto.date),
                checkInAt: dto.checkInAt
                    ? new Date(dto.checkInAt)
                    : (finalStatus === AttendanceStatus.ABSENT ? null : new Date(dto.date)),
                checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : null,
                status: finalStatus,
                absentFeeAmount,
                isManuallyAdjusted: true,
                adjustmentReasonCategory: dto.reasonCategory,
                adjustmentReason: dto.reason,
                adjustedById,
            },
        });
    }

    /**
     * Runs once daily, shortly after midnight WAT, to mark ABSENT any
     * active staff member who was expected to work yesterday (per their
     * own calendar) and simply never clocked in — closing the gap this
     * system otherwise had: nothing else ever sets ABSENT automatically,
     * so without this a no-show just leaves no record at all, and the
     * monthly summary's derived absence figure is the only place it ever
     * surfaced. Runs on yesterday specifically (never today) so a person
     * who's simply running late is never caught mid-day — the day has to
     * be fully over first. Idempotent: a staff member who already has any
     * record for that date (clocked in, or already manually handled) is
     * left alone entirely.
     */
    @Cron('30 0 * * *', { timeZone: 'Africa/Lagos' })
    async markAbsencesForYesterday() {
        const yesterday = watTodayDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));

        const activeStaff = await this.prisma.staff.findMany({
            where: { employmentStatus: 'ACTIVE' },
            select: { id: true, locationId: true },
        });

        let marked = 0;
        let markedNoCheckout = 0;
        for (const staff of activeStaff) {
            const existing = await this.prisma.attendanceRecord.findUnique({
                where: { staffId_date: { staffId: staff.id, date: new Date(yesterday) } },
            });

            if (existing) {
                // Not a no-show — they clocked in. But if they never checked out
                // (the 10pm cutoff in clockOut() means this can only happen by
                // genuinely forgetting, not by checking out late), the day still
                // resolves to ABSENT rather than staying PRESENT/LATE with an
                // open-ended checkout. Anything already resolved another way
                // (on leave, public holiday, extra work day, or already flipped)
                // is left untouched.
                if (
                    existing.checkInAt &&
                    !existing.checkOutAt &&
                    (existing.status === AttendanceStatus.PRESENT || existing.status === AttendanceStatus.LATE)
                ) {
                    const absentFeeAmount = await this.calculateAbsentFee(staff.id, yesterday);
                    await this.prisma.attendanceRecord.update({
                        where: { id: existing.id },
                        data: { status: AttendanceStatus.ABSENT, absentFeeAmount },
                    });
                    markedNoCheckout += 1;
                }
                continue; // already accounted for, one way or another
            }

            const effectiveDay = await this.workCalendarService.resolveEffectiveDay(staff.id, yesterday);
            if (effectiveDay.dayType === 'OFF') continue; // not expected to work at all

            const holidayException = await this.resolveBusinessException(staff.locationId, yesterday);
            if (holidayException?.isClosed) continue; // business/branch was closed — not their fault

            const onApprovedLeave = await this.prisma.leaveRequest.findFirst({
                where: {
                    staffId: staff.id,
                    status: 'APPROVED',
                    type: { in: [LeaveRequestType.ANNUAL_LEAVE, LeaveRequestType.SICK_LEAVE, LeaveRequestType.CASUAL_LEAVE, LeaveRequestType.DAY_OFF] },
                    startDate: { lte: new Date(yesterday) },
                    endDate: { gte: new Date(yesterday) },
                },
            });
            if (onApprovedLeave) continue;

            const absentFeeAmount = await this.calculateAbsentFee(staff.id, yesterday);
            await this.prisma.attendanceRecord.create({
                data: {
                    staffId: staff.id,
                    locationId: staff.locationId,
                    date: new Date(yesterday),
                    checkInAt: null,
                    status: AttendanceStatus.ABSENT,
                    absentFeeAmount,
                },
            });
            marked += 1;
        }

        if (marked > 0 || markedNoCheckout > 0) {
            this.logger.log(
                `Auto-marked ${marked} no-show(s) and ${markedNoCheckout} no-checkout(s) absent for ${yesterday}`,
            );
        }
    }

    /** HCS v1.0 Part B, Phase 3 — extra work days awaiting an approve/reject decision. */
    async getExtraWorkDayQueue(params: { branchId?: string; staffId?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' }) {
        return this.prisma.attendanceRecord.findMany({
            where: {
                status: AttendanceStatus.EXTRA_WORK_DAY_PENDING,
                extraWorkDayApproval: params.status ?? 'PENDING',
                ...(params.branchId && { locationId: params.branchId }),
                ...(params.staffId && { staffId: params.staffId }),
            },
            include: {
                staff: { select: { id: true, name: true, locationId: true } },
                extraWorkDayDecidedBy: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: { date: 'desc' },
        });
    }

    async decideExtraWorkDay(recordId: string, decidedById: string, approve: boolean, note?: string) {
        const record = await this.prisma.attendanceRecord.findUnique({ where: { id: recordId } });
        if (!record) {
            throw new NotFoundException('Attendance record not found');
        }
        if (record.status !== AttendanceStatus.EXTRA_WORK_DAY_PENDING) {
            throw new BadRequestException('This attendance record is not an extra work day');
        }
        if (record.extraWorkDayApproval !== 'PENDING') {
            throw new BadRequestException(`This extra work day has already been ${record.extraWorkDayApproval?.toLowerCase()}`);
        }
        if (!approve && !note) {
            throw new BadRequestException('A reason is required when rejecting an extra work day');
        }

        return this.prisma.attendanceRecord.update({
            where: { id: recordId },
            data: {
                extraWorkDayApproval: approve ? 'APPROVED' : 'REJECTED',
                extraWorkDayDecidedById: decidedById,
                extraWorkDayDecidedAt: new Date(),
                extraWorkDayNote: note,
            },
        });
    }

    async findMyHistory(staffId: string, from?: string, to?: string) {
        return this.prisma.attendanceRecord.findMany({
            where: {
                staffId,
                ...(from || to
                    ? {
                        date: {
                            ...(from && { gte: new Date(from) }),
                            ...(to && { lte: new Date(to) }),
                        },
                    }
                    : {}),
            },
            orderBy: { date: 'desc' },
        });
    }
}