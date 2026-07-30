import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import {
    ApprovalActionType,
    ApprovalRequestType,
    ApprovalStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CreateApprovalParams {
    requestType: ApprovalRequestType;
    branchId?: string | null;
    submittedById: string;
    /** Skip default-approver resolution and route straight to this staffId. */
    initialApproverId?: string | null;
}

/**
 * Generic approval-chain engine. One ApprovalRequest row per thing awaiting
 * approval, one ApprovalAction row per stage transition (submit / approve /
 * reject / reassign / more-info) — see prisma schema comments for the full
 * rationale. Domain modules (Leave, Inventory, ...) own their own business
 * data and call into this service for the workflow/audit-trail layer.
 */
@Injectable()
export class ApprovalService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Default approver resolution: the submitting staff member's branch
     * manager first, falling back to any staff account holding an admin
     * role if the branch has no manager assigned yet. Returns null only if
     * neither exists (e.g. a brand-new branch with zero admin accounts) —
     * callers should surface that as a configuration problem, not silently
     * leave a request unroutable.
     */
    async resolveDefaultApprover(branchId: string | null | undefined): Promise<string | null> {
        if (branchId) {
            const branch = await this.prisma.staffLocation.findUnique({
                where: { id: branchId },
                select: { managerId: true },
            });
            if (branch?.managerId) return branch.managerId;
        }

        const fallbackAdminStaff = await this.prisma.staff.findFirst({
            where: { user: { adminRole: { isNot: null } } },
        });
        return fallbackAdminStaff?.id ?? null;
    }

    async create(params: CreateApprovalParams) {
        const currentApproverId =
            params.initialApproverId ?? (await this.resolveDefaultApprover(params.branchId));

        const request = await this.prisma.approvalRequest.create({
            data: {
                requestType: params.requestType,
                branchId: params.branchId ?? null,
                submittedById: params.submittedById,
                currentApproverId,
                status: ApprovalStatus.PENDING,
            },
        });

        await this.prisma.approvalAction.create({
            data: {
                approvalRequestId: request.id,
                actorId: params.submittedById,
                action: ApprovalActionType.SUBMITTED,
                toApproverId: currentApproverId,
            },
        });

        return request;
    }

    async findById(id: string) {
        const request = await this.prisma.approvalRequest.findUnique({
            where: { id },
            include: { actions: { orderBy: { actedAt: 'asc' } } },
        });
        if (!request) throw new NotFoundException('Approval request not found');
        return request;
    }

    /** Everything currently sitting in this staff member's queue. */
    async findPendingForApprover(staffId: string) {
        return this.prisma.approvalRequest.findMany({
            where: { currentApproverId: staffId, status: ApprovalStatus.PENDING },
            orderBy: { createdAt: 'asc' },
            include: {
                submittedBy: { select: { id: true, name: true, staffCode: true } },
                branch: { select: { id: true, name: true } },
                leaveRequest: { select: { id: true, type: true, startDate: true, endDate: true, reason: true } },
                stockAdjustmentRequest: {
                    select: {
                        id: true, quantityDelta: true, reason: true,
                        item: { select: { name: true } },
                    },
                },
                stockTransfer: {
                    select: {
                        id: true, quantity: true,
                        fromItem: { select: { name: true, branch: { select: { name: true } } } },
                        toBranch: { select: { name: true } },
                    },
                },
            },
        });
    }

    /**
     * `isElevated` lets Admin/Super Admin act on a request that isn't
     * currently sitting with them — e.g. approving something a manager
     * reassigned up, or overriding a stalled request. Non-elevated actors
     * must be the current approver of record.
     */
    async approve(id: string, actorId: string, isElevated: boolean, comment?: string) {
        const request = await this.assertActionable(id, actorId, isElevated);

        const updated = await this.prisma.approvalRequest.update({
            where: { id },
            data: { status: ApprovalStatus.APPROVED },
        });

        await this.prisma.approvalAction.create({
            data: {
                approvalRequestId: id,
                actorId,
                action: ApprovalActionType.APPROVED,
                comment,
            },
        });

        return updated;
    }

    async reject(id: string, actorId: string, isElevated: boolean, comment?: string) {
        const request = await this.assertActionable(id, actorId, isElevated);

        const updated = await this.prisma.approvalRequest.update({
            where: { id },
            data: { status: ApprovalStatus.REJECTED },
        });

        await this.prisma.approvalAction.create({
            data: {
                approvalRequestId: id,
                actorId,
                action: ApprovalActionType.REJECTED,
                comment,
            },
        });

        return updated;
    }

    /** Hand this request off to someone else — the manager-to-admin escalation case. */
    async reassign(
        id: string,
        actorId: string,
        isElevated: boolean,
        toApproverId: string,
        reason: string,
    ) {
        const request = await this.assertActionable(id, actorId, isElevated);

        const target = await this.prisma.staff.findUnique({ where: { id: toApproverId } });
        if (!target) throw new NotFoundException('Target approver staff record not found');

        const updated = await this.prisma.approvalRequest.update({
            where: { id },
            data: { currentApproverId: toApproverId },
        });

        await this.prisma.approvalAction.create({
            data: {
                approvalRequestId: id,
                actorId,
                action: ApprovalActionType.REASSIGNED,
                fromApproverId: request.currentApproverId,
                toApproverId,
                comment: reason,
            },
        });

        return updated;
    }

    async requestMoreInfo(id: string, actorId: string, isElevated: boolean, comment: string) {
        const request = await this.assertActionable(id, actorId, isElevated);

        const updated = await this.prisma.approvalRequest.update({
            where: { id },
            data: { status: ApprovalStatus.MORE_INFO_REQUESTED },
        });

        await this.prisma.approvalAction.create({
            data: {
                approvalRequestId: id,
                actorId,
                action: ApprovalActionType.MORE_INFO_REQUESTED,
                comment,
            },
        });

        return updated;
    }

    private async assertActionable(id: string, actorId: string, isElevated: boolean) {
        const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Approval request not found');

        if (request.status !== ApprovalStatus.PENDING && request.status !== ApprovalStatus.MORE_INFO_REQUESTED) {
            throw new BadRequestException(`Cannot act on a request that is already ${request.status}`);
        }

        if (!isElevated && request.currentApproverId !== actorId) {
            throw new ForbiddenException('This request is not currently awaiting your approval');
        }

        return request;
    }
}
