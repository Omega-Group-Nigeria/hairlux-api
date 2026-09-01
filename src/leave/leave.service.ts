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
import { RejectLeaveRequestDto, ReassignLeaveRequestDto } from './dto/leave-request-action.dto';
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

    /**
     * Dev Feedback Round 6, item #22. AdminLeaveController is gated only
     * by the ADMIN/SUPER_ADMIN role (see its class-level @Roles), with no
     * @Permission check on any of its endpoints -- but the frontend's
     * staff dropdowns were calling GET /admin/staff, which requires the
     * staff:read permission specifically. SUPER_ADMIN bypasses permission
     * checks unconditionally (PermissionGuard), but a plain ADMIN does
     * not -- one without staff:read individually granted could reach this
     * page (role check passes) yet have the dropdown silently fail to
     * populate (permission check fails, error swallowed by the frontend's
     * non-fatal catch). A minimal, same-gating endpoint here sidesteps
     * that mismatch entirely rather than widening staff:read's own scope.
     */
    async listStaffOptions() {
        return this.prisma.staff.findMany({
            where: { employmentStatus: { not: 'ARCHIVED' } }, // matches /admin/staff's own default (includeArchived: false) -- not just ACTIVE, since ON_LEAVE/SUSPENDED staff can still have leave requests worth filtering by
            select: { id: true, name: true, staffCode: true, locationId: true },
            orderBy: { name: 'asc' },
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

    /**
     * Dev Feedback Round 6, item #22: the frontend already had a working
     * reassign UI (dropdown, required reason) calling PATCH
     * .../reassign, but nothing on the backend implemented it at all.
     * Only a PENDING request can be reassigned -- matches approve/reject's
     * own guard, since an already-decided request has nothing left to
     * hand off. approverId is overwritten (its existing "current
     * approver" semantics); reassignmentReason/reassignedAt/reassignedById
     * record the fact and reason of the most recent reassignment.
     */
    async reassign(requestId: string, dto: ReassignLeaveRequestDto, actorUserId: string | undefined) {
        const request = await this.prisma.leaveRequest.findUnique({
            where: { id: requestId },
            include: { staff: true },
        });
        if (!request) throw new NotFoundException('Leave request not found');
        if (request.status !== LeaveRequestStatus.PENDING) {
            throw new BadRequestException(`Cannot reassign — request is already ${request.status}`);
        }

        const newApprover = await this.prisma.staff.findUnique({ where: { id: dto.toApproverId } });
        if (!newApprover) throw new NotFoundException('Staff member to reassign to was not found');
        if (dto.toApproverId === request.approverId) {
            throw new BadRequestException('This request is already assigned to that staff member');
        }

        // req.user.id off the JWT is a User id, not a Staff id --
        // reassignedById's FK points at Staff, so resolve it here rather
        // than at the controller (keeps StaffService out of this
        // controller's dependencies for one simple lookup).
        const actorStaff = actorUserId
            ? await this.prisma.staff.findFirst({ where: { userId: actorUserId } })
            : null;

        const updated = await this.prisma.leaveRequest.update({
            where: { id: requestId },
            data: {
                approverId: dto.toApproverId,
                reassignmentReason: dto.reason,
                reassignedAt: new Date(),
                reassignedById: actorStaff?.id,
            },
        });

        // Non-blocking, same pattern as approve/reject above.
        if (newApprover.email) {
            this.mailService.sendGenericEmail(
                newApprover.email,
                'A Leave Request Has Been Reassigned To You',
                this.renderReassignmentEmail(request, dto.reason),
            ).catch(() => { });
        }

        return updated;
    }

    private renderReassignmentEmail(
        request: { type: LeaveRequestType; startDate: Date; endDate: Date; reason: string; staff?: { name: string } | null },
        reassignmentReason: string,
    ): string {
        const dateRange = request.startDate.toDateString() === request.endDate.toDateString()
            ? request.startDate.toDateString()
            : `${request.startDate.toDateString()} to ${request.endDate.toDateString()}`;
        return [
            `<p>A leave/permission request has been reassigned to you for review.</p>`,
            `<p><strong>Staff member:</strong> ${request.staff?.name ?? 'Unknown'}<br/>`,
            `<strong>Type:</strong> ${request.type}<br/>`,
            `<strong>Dates:</strong> ${dateRange}<br/>`,
            `<strong>Their reason:</strong> ${request.reason}</p>`,
            `<p><strong>Why it was reassigned to you:</strong> ${reassignmentReason}</p>`,
        ].join('\n');
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