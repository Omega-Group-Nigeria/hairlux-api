import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceStatus, Prisma, LeaveRequestType } from '@prisma/client';
import { LeaveService } from 'src/leave/leave.service';
import { haversineDistanceMeters } from '../common/utils/geo.util';
import { PrismaService } from '../prisma/prisma.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';

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

        const today = new Date().toISOString().slice(0, 10);

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
                `You are ${Math.round(distanceMeters)}m from ${staff.location.name} — clock-in requires you to be on-site`,
            );
        }

        const now = new Date();

        // Public holiday check — takes priority over the normal late calculation.
        const holidayException = await this.prisma.businessException.findUnique({
            where: { date: new Date(today) },
        });

        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        let lateMinutes: number | null = null;

        if (holidayException?.isClosed) {
            status = AttendanceStatus.PUBLIC_HOLIDAY;
        } else {
            const businessHours = await this.prisma.businessHours.findUnique({
                where: { dayOfWeek: now.getDay() },
            });

            // An exception can override open/close times without fully closing the day
            // (e.g. shortened holiday hours) — exception times win when present.
            const openTime = holidayException?.openTime ?? businessHours?.openTime;
            const dayIsOpen = holidayException ? !holidayException.isClosed : (businessHours?.isOpen ?? true);

            if (dayIsOpen && openTime) {
                const [openHour, openMin] = openTime.split(':').map(Number);
                const scheduledStart = new Date(now);
                scheduledStart.setHours(openHour, openMin, 0, 0);

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
            },
        });
    }

    async clockOut(staffId: string, dto: ClockOutDto) {
        const today = new Date().toISOString().slice(0, 10);

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
                    `You are ${Math.round(distanceMeters)}m from ${staffLocation.name} — clock-out requires you to be on-site`,
                );
            }
        }

        const now = new Date();
        const todayStr = record.date.toISOString().slice(0, 10);
        const holidayException = await this.prisma.businessException.findUnique({
            where: { date: new Date(todayStr) },
        });
        const businessHours = await this.prisma.businessHours.findUnique({
            where: { dayOfWeek: now.getDay() },
        });

        const closeTime = holidayException?.closeTime ?? businessHours?.closeTime;
        const dayIsOpen = holidayException ? !holidayException.isClosed : (businessHours?.isOpen ?? true);

        let overtimeMinutes: number | null = null;
        if (dayIsOpen && closeTime) {
            const [closeHour, closeMin] = closeTime.split(':').map(Number);
            const scheduledEnd = new Date(now);
            scheduledEnd.setHours(closeHour, closeMin, 0, 0);

            if (now > scheduledEnd) {
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