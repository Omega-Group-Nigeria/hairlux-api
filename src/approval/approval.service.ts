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
    submittedById: string | undefined;
    /** Skip default-approver resolution and route straight to this staffId. Ignored if a chain is configured for this requestType. */
    initialApproverId?: string | null;
}

/**
 * Generic approval-chain engine. One ApprovalRequest row per thing awaiting
 * approval, one ApprovalAction row per stage transition (submit / approve /
 * reject / reassign / more-info) — see prisma schema comments for the full
 * rationale. Domain modules (Leave, Inventory, ...) own their own business
 * data and call into this service for the workflow/audit-trail layer.
 *
 * Phase 4 (Procurement): added optional, admin-configurable multi-stage
 * chains (ApprovalChainStage), routed by AdminRole rather than by a single
 * person. Strictly additive -- every method below falls through to its
 * original, unmodified behavior whenever a request type has no configured
 * chain stages, which is true for every existing request type today
 * (Leave, Inventory Adjustment, Stock Transfer). Only a request type an
 * admin has actually configured stages for (e.g. PURCHASE_REQUEST) takes
 * the new, role-based path.
 */
@Injectable()
export class ApprovalService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Staff.id -> linked User -> effective AdminRole ids (primary +
     * every secondary UserAdminRole). Same union AuthService and LmsService
     * both already compute for their own purposes, re-derived here rather
     * than depending on either directly -- ApprovalRequest deals in
     * Staff.id throughout (currentApproverId, submittedById), one hop
     * further from User than LmsService's own version of this needed.
     * Returns [] for a staff record with no linked User account (e.g.
     * pre-account-creation records) -- such a staff member simply can
     * never satisfy a role-based stage, which is correct.
     */
    private async getEffectiveRoleIdsForStaff(staffId: string): Promise<string[]> {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { userId: true } });
        if (!staff?.userId) return [];

        const user = await this.prisma.user.findUnique({ where: { id: staff.userId }, select: { adminRoleId: true } });
        const secondary = await this.prisma.userAdminRole.findMany({ where: { userId: staff.userId }, select: { adminRoleId: true } });

        const ids = new Set<string>(secondary.map((r) => r.adminRoleId));
        if (user?.adminRoleId) ids.add(user.adminRoleId);
        return Array.from(ids);
    }

    /**
     * Default approver resolution: the submitting staff member's branch
     * manager first, falling back to any staff account holding an admin
     * role if the branch has no manager assigned yet. Returns null only if
     * neither exists (e.g. a brand-new branch with zero admin accounts) —
     * callers should surface that as a configuration problem, not silently
     * leave a request unroutable. Only ever used when no chain is
     * configured for the request type -- see create() below.
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
        const firstStage = await this.prisma.approvalChainStage.findFirst({
            where: { requestType: params.requestType },
            orderBy: { stageOrder: 'asc' },
        });

        // Chain-based: routed by role, no specific person assigned yet.
        // Not chain-based (no stages configured for this request type):
        // exactly the original behavior, unchanged.
        const currentApproverId = firstStage
            ? null
            : (params.initialApproverId ?? (await this.resolveDefaultApprover(params.branchId)));

        const request = await this.prisma.approvalRequest.create({
            data: {
                requestType: params.requestType,
                branchId: params.branchId ?? null,
                submittedById: params.submittedById,
                currentApproverId,
                currentStageOrder: firstStage?.stageOrder,
                currentStageRoleId: firstStage?.approverRoleId,
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

    /** Everything currently sitting in this staff member's queue -- either assigned to them directly, or role-routed to a stage they hold the required AdminRole for. */
    async findPendingForApprover(staffId: string) {
        const roleIds = await this.getEffectiveRoleIdsForStaff(staffId);

        return this.prisma.approvalRequest.findMany({
            where: {
                status: ApprovalStatus.PENDING,
                OR: [
                    { currentApproverId: staffId },
                    ...(roleIds.length ? [{ currentStageRoleId: { in: roleIds } }] : []),
                ],
            },
            orderBy: { createdAt: 'asc' },
            include: {
                submittedBy: { select: { id: true, name: true, staffCode: true } },
                branch: { select: { id: true, name: true } },
                currentStageRole: { select: { id: true, name: true } },
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
     * must be the current approver of record, OR (chain-based requests
     * only) hold the AdminRole the current stage requires.
     *
     * For a chain-based request (currentStageOrder set), approving does
     * NOT finalize unless this was the last configured stage -- it
     * advances currentStageOrder/currentStageRoleId to the next stage and
     * leaves status PENDING. A request with no configured chain keeps the
     * exact original behavior: one approve() call finalizes it.
     */
    async approve(id: string, actorId: string | undefined, isElevated: boolean, comment?: string) {
        const request = await this.assertActionable(id, actorId, isElevated);

        let updated;
        if (request.currentStageOrder != null) {
            const nextStage = await this.prisma.approvalChainStage.findFirst({
                where: { requestType: request.requestType, stageOrder: { gt: request.currentStageOrder } },
                orderBy: { stageOrder: 'asc' },
            });

            updated = await this.prisma.approvalRequest.update({
                where: { id },
                data: nextStage
                    ? { currentStageOrder: nextStage.stageOrder, currentStageRoleId: nextStage.approverRoleId }
                    : { status: ApprovalStatus.APPROVED, currentStageOrder: null, currentStageRoleId: null, currentApproverId: null },
            });
        } else {
            updated = await this.prisma.approvalRequest.update({
                where: { id },
                data: { status: ApprovalStatus.APPROVED },
            });
        }

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

    async reject(id: string, actorId: string | undefined, isElevated: boolean, comment?: string) {
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
        actorId: string | undefined,
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

    private async assertActionable(id: string, actorId: string | undefined, isElevated: boolean) {
        const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Approval request not found');

        if (request.status !== ApprovalStatus.PENDING && request.status !== ApprovalStatus.MORE_INFO_REQUESTED) {
            throw new BadRequestException(`Cannot act on a request that is already ${request.status}`);
        }

        if (isElevated) return request;

        if (request.currentApproverId && request.currentApproverId === actorId) return request;

        if (request.currentStageRoleId && actorId) {
            const roleIds = await this.getEffectiveRoleIdsForStaff(actorId);
            if (roleIds.includes(request.currentStageRoleId)) return request;
        }

        throw new ForbiddenException('This request is not currently awaiting your approval');
    }

    // ── Admin-configurable chain management (Phase 4) ───────────────────

    async getChainStages(requestType: ApprovalRequestType) {
        return this.prisma.approvalChainStage.findMany({
            where: { requestType },
            orderBy: { stageOrder: 'asc' },
            include: { approverRole: { select: { id: true, name: true } } },
        });
    }

    /** Every request type that currently has at least one configured stage, with its full ordered chain. */
    async getAllChains() {
        const stages = await this.prisma.approvalChainStage.findMany({
            orderBy: [{ requestType: 'asc' }, { stageOrder: 'asc' }],
            include: { approverRole: { select: { id: true, name: true } } },
        });

        const byType = new Map<ApprovalRequestType, typeof stages>();
        for (const stage of stages) {
            const existing = byType.get(stage.requestType) ?? [];
            existing.push(stage);
            byType.set(stage.requestType, existing);
        }
        return Array.from(byType.entries()).map(([requestType, chainStages]) => ({ requestType, stages: chainStages }));
    }

    /**
     * Replaces the full chain for this request type in one call --
     * deleteMany + create, same pattern already used for LMS course roles
     * and vendor-product links elsewhere in this rebuild. Passing an empty
     * array removes the chain entirely, reverting that request type to
     * the original single-approver behavior for any request created after
     * this point (requests already in flight keep whatever stage they're
     * currently on).
     */
    async setChainStages(requestType: ApprovalRequestType, roleIds: string[]) {
        await this.prisma.approvalChainStage.deleteMany({ where: { requestType } });
        if (roleIds.length === 0) return [];

        await this.prisma.approvalChainStage.createMany({
            data: roleIds.map((approverRoleId, index) => ({
                requestType,
                stageOrder: index + 1,
                approverRoleId,
            })),
        });

        return this.getChainStages(requestType);
    }
}