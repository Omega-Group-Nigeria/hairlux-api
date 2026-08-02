import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    ApprovalRequestType,
    LowStockAlertStage,
    Prisma,
    StockMovementType,
    StockTransferStatus
} from '@prisma/client';
import { ApprovalService } from '../approval/approval.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { RequestTransferDto } from './dto/request-transfer.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

const ESCALATION_WINDOW_HOURS = 6;
const EXPIRY_WARNING_DAYS = 30; // items expiring within this many days get an EXPIRING_SOON alert
const STAGE_ORDER: LowStockAlertStage[] = [
    LowStockAlertStage.SUPERVISOR,
    LowStockAlertStage.OPERATIONS,
    LowStockAlertStage.MANAGEMENT,
];

@Injectable()
export class InventoryService {
    private readonly logger = new Logger(InventoryService.name);

    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
        private approvalService: ApprovalService,
    ) { }

    async createItem(dto: CreateInventoryItemDto, branchId: string) {
        const existing = await this.prisma.inventoryItem.findFirst({
            where: { branchId, name: dto.name, category: dto.category },
        });
        if (existing) {
            throw new BadRequestException('An item with this name and category already exists at this branch');
        }
        if (dto.category === 'FOR_SALE' && (dto.price === undefined || dto.price === null)) {
            throw new BadRequestException('A price is required for items in the "For Sale" category');
        }

        return this.prisma.inventoryItem.create({
            data: {
                name: dto.name,
                category: dto.category,
                branchId,
                supplierId: dto.supplierId,
                unit: dto.unit,
                lowStockThreshold: dto.lowStockThreshold ?? 5,
                currentQuantity: dto.initialQuantity ?? 0,
                expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
                price: dto.category === 'FOR_SALE' ? dto.price : (dto.price ?? undefined),
            },
        });
    }

    async updateItem(id: string, dto: UpdateInventoryItemDto) {
        const item = await this.findOne(id);
        const nextCategory = dto.category ?? item.category;
        const nextPrice = dto.price !== undefined ? dto.price : Number(item.price ?? 0) || undefined;

        if (nextCategory === 'FOR_SALE' && !nextPrice) {
            throw new BadRequestException('A price is required for items in the "For Sale" category');
        }

        return this.prisma.inventoryItem.update({
            where: { id },
            data: {
                name: dto.name,
                category: dto.category,
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                unit: dto.unit,
                lowStockThreshold: dto.lowStockThreshold,
                expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
                price: dto.price !== undefined ? dto.price : undefined,
            },
        });
    }

    async findAll(query: QueryInventoryDto) {
        const { branchId, category, lowStockOnly, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.InventoryItemWhereInput = {
            isActive: true,
            ...(branchId && { branchId }),
            ...(category && { category }),
            ...(lowStockOnly && {
                currentQuantity: { lte: this.prisma.inventoryItem.fields.lowStockThreshold as any },
            }),
        };

        // Prisma can't compare two columns directly in `where` without a raw query;
        // for lowStockOnly, filter in application code instead of the DB when needed.
        const items = await this.prisma.inventoryItem.findMany({
            where: branchId || category ? { isActive: true, ...(branchId && { branchId }), ...(category && { category }) } : { isActive: true },
            include: { branch: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true, type: true } } },
            orderBy: { name: 'asc' },
        });

        const filtered = lowStockOnly
            ? items.filter((i) => i.currentQuantity <= i.lowStockThreshold)
            : items;

        const total = filtered.length;
        const data = filtered.slice(skip, skip + limit);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const item = await this.prisma.inventoryItem.findUnique({
            where: { id },
            include: { branch: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true, type: true } } },
        });
        if (!item) throw new NotFoundException('Inventory item not found');
        return item;
    }

    async receiveGoods(itemId: string, dto: ReceiveGoodsDto, staffId: string) {
        const item = await this.findOne(itemId);

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                data: { currentQuantity: { increment: dto.quantity } },
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.RECEIVED,
                    quantityDelta: dto.quantity,
                    performedById: staffId,
                    reason: dto.note,
                },
            }),
        ]);

        return updated;
    }

    /** The actual stock mutation — only ever called once an adjustment is approved (or by an elevated Admin submitting one, which auto-approves). */
    private async applyAdjustment(itemId: string, quantityDelta: number, reason: string, staffId: string | undefined) {
        const item = await this.findOne(itemId);
        const newQuantity = item.currentQuantity + quantityDelta;

        if (newQuantity < 0) {
            throw new BadRequestException('Adjustment would result in negative stock — not permitted');
        }

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                data: { currentQuantity: newQuantity },
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.ADJUSTMENT,
                    quantityDelta,
                    performedById: staffId,
                    reason,
                },
            }),
        ]);

        if (quantityDelta < 0) {
            await this.checkAndTriggerLowStockAlert(itemId);
        }

        return updated;
    }

    /**
     * Submit a stock adjustment for approval — does NOT touch inventory yet.
     * `isElevated` (Admin/Super Admin submitting) auto-approves and applies
     * immediately, still going through the same ApprovalRequest/Action audit
     * trail as a regular request, just pre-approved by the same actor.
     */
    async requestStockAdjustment(itemId: string, dto: AdjustStockDto, staffId: string | undefined, isElevated: boolean) {
        const item = await this.findOne(itemId);

        const approvalRequest = await this.approvalService.create({
            requestType: ApprovalRequestType.INVENTORY_ADJUSTMENT,
            branchId: item.branchId,
            submittedById: staffId,
        });

        const adjustmentRequest = await this.prisma.stockAdjustmentRequest.create({
            data: {
                itemId,
                quantityDelta: dto.quantityDelta,
                reason: dto.reason,
                requestedById: staffId,
                approvalRequestId: approvalRequest.id,
            },
        });

        if (isElevated) {
            return this.approveStockAdjustment(adjustmentRequest.id, staffId, true);
        }

        return adjustmentRequest;
    }

    async approveStockAdjustment(requestId: string, actorId: string | undefined, isElevated: boolean) {
        const request = await this.prisma.stockAdjustmentRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('Stock adjustment request not found');
        if (request.status !== 'PENDING') {
            throw new BadRequestException(`Cannot approve — request is already ${request.status}`);
        }

        await this.approvalService.approve(request.approvalRequestId, actorId, isElevated);

        // Re-validate at execution time, not just at request time — stock may
        // have moved since this was submitted (sale, another adjustment, etc.).
        await this.applyAdjustment(request.itemId, request.quantityDelta, request.reason, actorId);

        return this.prisma.stockAdjustmentRequest.update({
            where: { id: requestId },
            data: { status: 'APPROVED', appliedAt: new Date() },
        });
    }

    async rejectStockAdjustment(requestId: string, actorId: string | undefined, isElevated: boolean, reason: string) {
        const request = await this.prisma.stockAdjustmentRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('Stock adjustment request not found');
        if (request.status !== 'PENDING') {
            throw new BadRequestException(`Cannot reject — request is already ${request.status}`);
        }

        await this.approvalService.reject(request.approvalRequestId, actorId, isElevated, reason);

        return this.prisma.stockAdjustmentRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED' },
        });
    }

    async reassignStockAdjustment(requestId: string, actorId: string | undefined, isElevated: boolean, toApproverId: string, reason: string) {
        const request = await this.prisma.stockAdjustmentRequest.findUnique({ where: { id: requestId } });
        if (!request) throw new NotFoundException('Stock adjustment request not found');
        if (request.status !== 'PENDING') {
            throw new BadRequestException(`Cannot reassign — request is already ${request.status}`);
        }

        await this.approvalService.reassign(request.approvalRequestId, actorId, isElevated, toApproverId, reason);
        return request;
    }

    async findAdjustmentRequests(branchId?: string, status?: string) {
        return this.prisma.stockAdjustmentRequest.findMany({
            where: {
                ...(status && { status: status as any }),
                ...(branchId && { item: { branchId } }),
            },
            include: {
                item: { select: { name: true, branchId: true, branch: { select: { name: true } } } },
                requestedBy: { select: { id: true, name: true, staffCode: true } },
                approvalRequest: { select: { currentApproverId: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Deduct stock for a completed sale. Called internally by the Sales module
     * once it exists — exposed here as a direct method, not necessarily its
     * own public endpoint, since a Sale/Booking should be the real trigger.
     */
    async deductForSale(itemId: string, quantity: number, referenceId?: string) {
        const item = await this.findOne(itemId);

        if (item.currentQuantity < quantity) {
            throw new BadRequestException(
                `Insufficient stock for "${item.name}" — ${item.currentQuantity} available, ${quantity} requested`,
            );
        }

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                data: { currentQuantity: { decrement: quantity } },
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.SOLD,
                    quantityDelta: -quantity,
                    referenceId,
                    performedById: item.branchId, // TODO: replace with actual acting staff once Sales module supplies one
                },
            }),
        ]);

        await this.checkAndTriggerLowStockAlert(itemId);
        return updated;
    }

    async checkAndTriggerLowStockAlert(itemId: string) {
        const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId } });
        if (!item || item.currentQuantity > item.lowStockThreshold) return;

        const openAlert = await this.prisma.lowStockAlert.findFirst({
            where: { itemId, resolvedAt: null },
        });
        if (openAlert) return; // already alerted, don't spam a new one

        const alert = await this.prisma.lowStockAlert.create({
            data: { itemId },
        });

        this.notifyStage(item.name, LowStockAlertStage.SUPERVISOR, item.currentQuantity, item.lowStockThreshold)
            .catch((err) => this.logger.error(`Low-stock notification failed: ${err instanceof Error ? err.message : String(err)}`));

        return alert;
    }

    async findAlerts(branchId?: string, resolved?: boolean) {
        return this.prisma.lowStockAlert.findMany({
            where: {
                ...(resolved !== undefined && { resolvedAt: resolved ? { not: null } : null }),
                item: branchId ? { branchId } : undefined,
            },
            include: { item: { include: { branch: { select: { name: true } } } } },
            orderBy: { triggeredAt: 'desc' },
        });
    }

    async resolveAlert(alertId: string, staffId: string | undefined) {
        const alert = await this.prisma.lowStockAlert.findUnique({ where: { id: alertId } });
        if (!alert) throw new NotFoundException('Alert not found');
        if (alert.resolvedAt) throw new BadRequestException('Alert already resolved');

        return this.prisma.lowStockAlert.update({
            where: { id: alertId },
            data: { resolvedAt: new Date(), resolvedById: staffId },
        });
    }

    // ── Expiry Alerts ──────────────────────────────────────────────────────
    // Separate from low-stock alerts — a product can be well-stocked and
    // still be sitting on a shelf past (or approaching) its expiry date.

    async findExpiryAlerts(branchId?: string, resolved?: boolean) {
        return this.prisma.expiryAlert.findMany({
            where: {
                ...(resolved !== undefined && { resolvedAt: resolved ? { not: null } : null }),
                item: branchId ? { branchId } : undefined,
            },
            include: { item: { include: { branch: { select: { name: true } } } } },
            orderBy: { triggeredAt: 'desc' },
        });
    }

    async resolveExpiryAlert(alertId: string, staffId: string | undefined) {
        const alert = await this.prisma.expiryAlert.findUnique({ where: { id: alertId } });
        if (!alert) throw new NotFoundException('Expiry alert not found');
        if (alert.resolvedAt) throw new BadRequestException('Alert already resolved');

        return this.prisma.expiryAlert.update({
            where: { id: alertId },
            data: { resolvedAt: new Date(), resolvedById: staffId },
        });
    }

    /**
     * Runs once daily — checks every item with an expiry date set and either
     * opens or upgrades an alert. Idempotent: an item with an already-open
     * alert at the correct severity is left alone (no duplicate spam); one
     * approaching expiry that's since actually expired gets upgraded from
     * EXPIRING_SOON to EXPIRED rather than getting a second alert.
     */
    @Cron(CronExpression.EVERY_DAY_AT_6AM)
    async checkExpiringItems() {
        const now = new Date();
        const warningCutoff = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);

        const candidates = await this.prisma.inventoryItem.findMany({
            where: { expiryDate: { not: null, lte: warningCutoff }, currentQuantity: { gt: 0 } },
        });

        let opened = 0;
        for (const item of candidates) {
            if (!item.expiryDate) continue;
            const severity = item.expiryDate <= now ? 'EXPIRED' : 'EXPIRING_SOON';

            const openAlert = await this.prisma.expiryAlert.findFirst({
                where: { itemId: item.id, resolvedAt: null },
            });

            if (!openAlert) {
                await this.prisma.expiryAlert.create({ data: { itemId: item.id, severity } });
                opened += 1;
            } else if (openAlert.severity !== severity && severity === 'EXPIRED') {
                // Upgrade in place rather than opening a second alert for the same item.
                await this.prisma.expiryAlert.update({ where: { id: openAlert.id }, data: { severity } });
            }
        }

        if (opened) {
            this.logger.log(`Opened ${opened} new expiry alert(s)`);
        }
    }

    /** Runs every 30 minutes; escalates any alert that's sat unresolved past the 6-hour window at its current stage. */
    @Cron(CronExpression.EVERY_30_MINUTES)
    async escalateOverdueAlerts() {
        const cutoff = new Date(Date.now() - ESCALATION_WINDOW_HOURS * 60 * 60 * 1000);

        const overdue = await this.prisma.lowStockAlert.findMany({
            where: {
                resolvedAt: null,
                currentStage: { not: LowStockAlertStage.MANAGEMENT },
                OR: [
                    { escalatedAt: null, triggeredAt: { lte: cutoff } },
                    { escalatedAt: { lte: cutoff } },
                ],
            },
            include: { item: true },
        });

        for (const alert of overdue) {
            const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(alert.currentStage) + 1];
            await this.prisma.lowStockAlert.update({
                where: { id: alert.id },
                data: { currentStage: nextStage, escalatedAt: new Date() },
            });

            this.notifyStage(alert.item.name, nextStage, alert.item.currentQuantity, alert.item.lowStockThreshold)
                .catch((err) => this.logger.error(`Escalation notification failed: ${err instanceof Error ? err.message : String(err)}`));
        }

        if (overdue.length) {
            this.logger.log(`Escalated ${overdue.length} low-stock alert(s)`);
        }
    }

    /**
     * SIMPLIFICATION: this codebase has no distinct Supervisor/Operations/Management
     * roles — only ADMIN/SUPER_ADMIN. Every stage currently notifies all admin users
     * rather than a genuinely tiered audience. Revisit once real role tiers exist.
     */
    private async notifyStage(itemName: string, stage: LowStockAlertStage, current: number, threshold: number) {
        const admins = await this.prisma.user.findMany({
            where: { adminRole: { isNot: null } },
            select: { email: true, firstName: true },
        });

        await Promise.all(
            admins.map((admin) =>
                this.mailService.sendLowStockAlertEmail(admin.email, admin.firstName, {
                    itemName,
                    stage,
                    currentQuantity: current,
                    threshold,
                }),
            ),
        );
    }

    // ── Stock Transfers ──────────────────────────────────────────────

    // ── Stock Transfers ──────────────────────────────────────────────

    async requestTransfer(dto: RequestTransferDto, requestedById: string) {
        const fromItem = await this.findOne(dto.fromItemId);

        if (fromItem.branchId === dto.toBranchId) {
            throw new BadRequestException('Source and destination branch cannot be the same');
        }
        if (fromItem.currentQuantity < dto.quantity) {
            throw new BadRequestException(
                `Insufficient stock — ${fromItem.currentQuantity} available, ${dto.quantity} requested`,
            );
        }

        const approvalRequest = await this.approvalService.create({
            requestType: ApprovalRequestType.STOCK_TRANSFER,
            branchId: fromItem.branchId,
            submittedById: requestedById,
        });

        return this.prisma.stockTransfer.create({
            data: {
                fromItemId: dto.fromItemId,
                toBranchId: dto.toBranchId,
                quantity: dto.quantity,
                requestedById,
                approvalRequestId: approvalRequest.id,
            },
        });
    }

    async approveTransfer(transferId: string, actorId: string | undefined, isElevated: boolean) {
        const transfer = await this.prisma.stockTransfer.findUnique({
            where: { id: transferId },
            include: { fromItem: true },
        });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.PENDING) {
            throw new BadRequestException(`Cannot approve — transfer is already ${transfer.status}`);
        }

        if (transfer.approvalRequestId) {
            await this.approvalService.approve(transfer.approvalRequestId, actorId, isElevated);
        }

        // Re-validate stock at execution time, not just at request time — it may have changed.
        const currentFromItem = await this.prisma.inventoryItem.findUnique({ where: { id: transfer.fromItemId } });
        if (!currentFromItem || currentFromItem.currentQuantity < transfer.quantity) {
            throw new BadRequestException('Source item no longer has sufficient stock for this transfer');
        }

        let toItem = await this.prisma.inventoryItem.findFirst({
            where: {
                branchId: transfer.toBranchId,
                name: currentFromItem.name,
                category: currentFromItem.category,
            },
        });

        const now = new Date();

        await this.prisma.$transaction(async (tx) => {
            await tx.inventoryItem.update({
                where: { id: transfer.fromItemId },
                data: { currentQuantity: { decrement: transfer.quantity } },
            });

            if (!toItem) {
                toItem = await tx.inventoryItem.create({
                    data: {
                        name: currentFromItem.name,
                        category: currentFromItem.category,
                        branchId: transfer.toBranchId,
                        unit: currentFromItem.unit,
                        lowStockThreshold: currentFromItem.lowStockThreshold,
                        currentQuantity: 0,
                    },
                });
            }

            await tx.inventoryItem.update({
                where: { id: toItem.id },
                data: { currentQuantity: { increment: transfer.quantity } },
            });

            await tx.stockMovement.createMany({
                data: [
                    {
                        itemId: transfer.fromItemId,
                        type: StockMovementType.TRANSFER_OUT,
                        quantityDelta: -transfer.quantity,
                        referenceId: transfer.id,
                        performedById: actorId,
                    },
                    {
                        itemId: toItem.id,
                        type: StockMovementType.TRANSFER_IN,
                        quantityDelta: transfer.quantity,
                        referenceId: transfer.id,
                        performedById: actorId,
                    },
                ],
            });

            await tx.stockTransfer.update({
                where: { id: transferId },
                data: {
                    status: StockTransferStatus.COMPLETED,
                    approvedById: actorId,
                    approvedAt: now,
                    completedAt: now,
                },
            });
        });

        await this.checkAndTriggerLowStockAlert(transfer.fromItemId);

        return this.prisma.stockTransfer.findUnique({ where: { id: transferId } });
    }

    async rejectTransfer(transferId: string, actorId: string | undefined, isElevated: boolean, dto: RejectTransferDto) {
        const transfer = await this.prisma.stockTransfer.findUnique({ where: { id: transferId } });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.PENDING) {
            throw new BadRequestException(`Cannot reject — transfer is already ${transfer.status}`);
        }

        if (transfer.approvalRequestId) {
            await this.approvalService.reject(transfer.approvalRequestId, actorId, isElevated, dto.reason);
        }

        return this.prisma.stockTransfer.update({
            where: { id: transferId },
            data: { status: StockTransferStatus.REJECTED, rejectionReason: dto.reason },
        });
    }

    async reassignTransfer(transferId: string, actorId: string | undefined, isElevated: boolean, toApproverId: string, reason: string) {
        const transfer = await this.prisma.stockTransfer.findUnique({ where: { id: transferId } });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.PENDING) {
            throw new BadRequestException(`Cannot reassign — transfer is already ${transfer.status}`);
        }
        if (!transfer.approvalRequestId) {
            throw new BadRequestException('This transfer has no approval chain to reassign (legacy record)');
        }

        await this.approvalService.reassign(transfer.approvalRequestId, actorId, isElevated, toApproverId, reason);
        return transfer;
    }

    async findTransfers(branchId?: string) {
        return this.prisma.stockTransfer.findMany({
            where: branchId
                ? { OR: [{ fromItem: { branchId } }, { toBranchId: branchId }] }
                : undefined,
            include: {
                fromItem: { select: { name: true, branchId: true, branch: { select: { name: true } } } },
                toBranch: { select: { name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async listBranches() {
        return this.prisma.staffLocation.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }
}