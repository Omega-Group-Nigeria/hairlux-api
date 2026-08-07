import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, LeaveRequestType, Prisma } from '@prisma/client';
import { LeaveService } from 'src/leave/leave.service';
import { haversineDistanceMeters } from '../common/utils/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

function formatDistance(meters: number): string {
    if (meters >= 1000) {
        return (meters / 1000).toFixed(1) + 'km';
    }
    return Math.round(meters) + 'm';
}

/**
 * Nigeria (WAT) is a fixed UTC+1 offset year-round — no daylight saving —
 * so a constant offset is enough here without needing a full timezone
 * database. Centralized because attendance business-hours logic needs to
 * reason in WAT regardless of what timezone the server process itself
 * happens to be running in (commonly UTC in production), and every one of
 * Date's local-timezone-dependent methods (getDay, setHours, the plain
 * Date constructor's local parsing) silently uses the SERVER's zone, not
 * WAT — which is exactly what caused the "closing time" / late-calculation
 * bugs this replaces.
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** 'YYYY-MM-DD' for "today" as a calendar date in WAT, not the server's own zone. */
function watTodayDateStr(now: Date): string {
    return new Date(now.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 (Sunday) .. 6 (Saturday), for "today" as a day-of-week in WAT. */
function watDayOfWeek(now: Date): number {
    return new Date(now.getTime() + WAT_OFFSET_MS).getUTCDay();
}

/** Builds a Date for a specific WAT calendar date ('YYYY-MM-DD') + "HH:MM" WAT clock time. */
function watDateAtTime(dateStr: string, hhmm: string): Date {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`);
}

@Injectable()
export class AttendanceService {
    constructor(private prisma: PrismaService,
        private leaveService: LeaveService
    ) { }
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

        // Public holiday check — takes priority over the normal late calculation.
        const holidayException = await this.prisma.businessException.findUnique({
            where: { date: new Date(today) },
        });

        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        let lateMinutes: number | null = null;
        let latePenaltyAmount: number | null = null;

        if (holidayException?.isClosed) {
            status = AttendanceStatus.PUBLIC_HOLIDAY;
        } else {
            const businessHours = await this.prisma.businessHours.findUnique({
                where: { dayOfWeek: watDayOfWeek(now) },
            });

            // An exception can override open/close times without fully closing the day
            // (e.g. shortened holiday hours) — exception times win when present.
            const openTime = holidayException?.openTime ?? businessHours?.openTime;
            const dayIsOpen = holidayException ? !holidayException.isClosed : (businessHours?.isOpen ?? true);

            if (dayIsOpen && openTime) {
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
        const holidayException = await this.prisma.businessException.findUnique({
            where: { date: new Date(todayStr) },
        });
        const businessHours = await this.prisma.businessHours.findUnique({
            where: { dayOfWeek: watDayOfWeek(now) },
        });

        const closeTime = holidayException?.closeTime ?? businessHours?.closeTime;
        const dayIsOpen = holidayException ? !holidayException.isClosed : (businessHours?.isOpen ?? true);

        let overtimeMinutes: number | null = null;
        let earlyDepartureMinutes: number | null = null;

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
        const { staffId, locationId, date, from, to, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.AttendanceRecordWhereInput = {
            ...(staffId && { staffId }),
            ...(locationId && { locationId }),
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

        return this.prisma.attendanceRecord.update({
            where: { id: recordId },
            data: {
                ...(dto.checkInAt !== undefined && { checkInAt: new Date(dto.checkInAt) }),
                ...(dto.checkOutAt !== undefined && { checkOutAt: new Date(dto.checkOutAt) }),
                ...(dto.status !== undefined && { status: dto.status }),
                isManuallyAdjusted: true,
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

        return this.prisma.attendanceRecord.create({
            data: {
                staffId,
                locationId: dto.locationId,
                date: new Date(dto.date),
                checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : new Date(dto.date),
                checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : null,
                status: dto.status ?? AttendanceStatus.PRESENT,
                isManuallyAdjusted: true,
                adjustmentReason: dto.reason,
                adjustedById,
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