import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
    LeaveRequestType,
    LeaveRequestStatus,
    AttendanceStatus,
    Prisma,
} from '@prisma/client';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { RejectLeaveRequestDto } from './dto/leave-request-action.dto';
import { QueryLeaveRequestDto } from './dto/query-leave-request.dto';

const NON_ATTENDANCE_TYPES: LeaveRequestType[] = [LeaveRequestType.OVERTIME_REQUEST];
const LEAVE_DAY_TYPES: LeaveRequestType[] = [
    LeaveRequestType.ANNUAL_LEAVE,
    LeaveRequestType.SICK_LEAVE,
    LeaveRequestType.CASUAL_LEAVE,
    LeaveRequestType.DAY_OFF,
];

@Injectable()
export class LeaveService {
    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
    ) { }

    async submit(staffId: string, dto: CreateLeaveRequestDto) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff record not found');

        if (new Date(dto.endDate) < new Date(dto.startDate)) {
            throw new BadRequestException('endDate cannot be before startDate');
        }

        const overlapping = await this.prisma.leaveRequest.findFirst({
            where: {
                staffId,
                status: { in: [LeaveRequestStatus.PENDING, LeaveRequestStatus.APPROVED] },
                startDate: { lte: new Date(dto.endDate) },
                endDate: { gte: new Date(dto.startDate) },
            },
        });
        if (overlapping) {
            throw new BadRequestException('You already have a pending or approved request overlapping these dates');
        }

        const approverId = await this.resolveApprover(staffId);

        return this.prisma.leaveRequest.create({
            data: {
                staffId,
                type: dto.type,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                startTime: dto.startTime,
                endTime: dto.endTime,
                reason: dto.reason,
                approverId,
            },
        });
    }

    private async resolveApprover(staffId: string): Promise<string | null> {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (staff?.reportingToId) return staff.reportingToId;

        const fallbackAdminStaff = await this.prisma.staff.findFirst({
            where: {
                user: { adminRole: { isNot: null } },
            },
        });
        return fallbackAdminStaff?.id ?? null;
    }

    async findMy(staffId: string) {
        return this.prisma.leaveRequest.findMany({
            where: { staffId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findAllAdmin(query: QueryLeaveRequestDto) {
        const { status, type, staffId, locationId, from, to, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.LeaveRequestWhereInput = {
            ...(status && { status }),
            ...(type && { type }),
            ...(staffId && { staffId }),
            ...(locationId && { staff: { locationId } }),
            // Overlap check: this leave's own range intersects [from, to] --
            // NOT filtering by when the request was submitted. Standard
            // range-overlap: leave.startDate <= to AND leave.endDate >= from.
            ...(from && { endDate: { gte: new Date(from) } }),
            ...(to && { startDate: { lte: new Date(to) } }),
        };

        const [data, total] = await Promise.all([
            this.prisma.leaveRequest.findMany({
                where,
                include: { staff: { select: { id: true, name: true, staffCode: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.leaveRequest.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async approve(requestId: string) {
        const request = await this.prisma.leaveRequest.findUnique({
            where: { id: requestId },
            include: { staff: true },
        });
        if (!request) throw new NotFoundException('Leave request not found');
        if (request.status !== LeaveRequestStatus.PENDING) {
            throw new BadRequestException(`Cannot approve — request is already ${request.status}`);
        }

        const updated = await this.prisma.leaveRequest.update({
            where: { id: requestId },
            data: { status: LeaveRequestStatus.APPROVED, approvedAt: new Date() },
        });

        if (LEAVE_DAY_TYPES.includes(request.type)) {
            await this.createAttendanceRecordsForLeave(request);
        }

        // Dev Feedback Round 4, item #17. Non-blocking -- sendGenericEmail
        // already catches and logs its own errors, never throws.
        if (request.staff?.email) {
            this.mailService.sendGenericEmail(
                request.staff.email,
                'Your Leave Request Has Been Approved',
                this.renderLeaveDecisionEmail(request, 'APPROVED'),
            ).catch(() => { });
        }

        return updated;
    }

    async reject(requestId: string, dto: RejectLeaveRequestDto) {
        const request = await this.prisma.leaveRequest.findUnique({
            where: { id: requestId },
            include: { staff: true },
        });
        if (!request) throw new NotFoundException('Leave request not found');
        if (request.status !== LeaveRequestStatus.PENDING) {
            throw new BadRequestException(`Cannot reject — request is already ${request.status}`);
        }

        const updated = await this.prisma.leaveRequest.update({
            where: { id: requestId },
            data: {
                status: LeaveRequestStatus.REJECTED,
                rejectionReason: dto.reason,
            },
        });

        if (request.staff?.email) {
            this.mailService.sendGenericEmail(
                request.staff.email,
                'Your Leave Request Was Not Approved',
                this.renderLeaveDecisionEmail(request, 'REJECTED', dto.reason),
            ).catch(() => { });
        }

        return updated;
    }

    /** Full content, not a vague "your request was updated" -- the type, the date range, the outcome, and (for a rejection) the reason. */
    private renderLeaveDecisionEmail(
        request: { type: LeaveRequestType; startDate: Date; endDate: Date; reason: string },
        outcome: 'APPROVED' | 'REJECTED',
        rejectionReason?: string,
    ): string {
        const typeLabel = request.type.replace(/_/g, ' ');
        const dateRange = request.startDate.getTime() === request.endDate.getTime()
            ? request.startDate.toDateString()
            : `${request.startDate.toDateString()} to ${request.endDate.toDateString()}`;
        const outcomeLine = outcome === 'APPROVED'
            ? '<p style="color:#2f9e44;font-weight:600">This request has been approved.</p>'
            : `<p style="color:#e03131;font-weight:600">This request was not approved.</p><p><strong>Reason:</strong> ${rejectionReason ?? ''}</p>`;

        return `
            <h2>Leave Request Update</h2>
            <p><strong>Type:</strong> ${typeLabel}</p>
            <p><strong>Dates:</strong> ${dateRange}</p>
            <p><strong>Your original reason:</strong> ${request.reason}</p>
            ${outcomeLine}
        `;
    }

    private async createAttendanceRecordsForLeave(request: {
        staffId: string;
        startDate: Date;
        endDate: Date;
        type: LeaveRequestType;
        approverId: string | null;
    }) {
        const staff = await this.prisma.staff.findUnique({ where: { id: request.staffId } });
        if (!staff) return;

        const dates: Date[] = [];
        const cursor = new Date(request.startDate);
        while (cursor <= request.endDate) {
            dates.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        for (const date of dates) {
            await this.prisma.attendanceRecord.upsert({
                where: { staffId_date: { staffId: request.staffId, date } },
                create: {
                    staffId: request.staffId,
                    locationId: staff.locationId,
                    date,
                    checkInAt: date,
                    status: AttendanceStatus.ON_LEAVE,
                    isManuallyAdjusted: true,
                    adjustmentReason: `Approved ${request.type}`,
                    adjustedById: request.approverId,
                },
                update: {
                    status: AttendanceStatus.ON_LEAVE,
                    isManuallyAdjusted: true,
                    adjustmentReason: `Approved ${request.type}`,
                    adjustedById: request.approverId,
                },
            });
        }
    }

    async findApprovedPermissionForToday(staffId: string, type: LeaveRequestType, today: Date) {
        return this.prisma.leaveRequest.findFirst({
            where: {
                staffId,
                type,
                status: LeaveRequestStatus.APPROVED,
                startDate: { lte: today },
                endDate: { gte: today },
            },
        });
    }
}