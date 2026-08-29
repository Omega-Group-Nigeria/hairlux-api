import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    ApprovalRequestType,
    LowStockAlertStage,
    Prisma,
    StockMovementType,
    StockTransferStatus,
    StockType
} from '@prisma/client';
import { ApprovalService } from '../approval/approval.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, StockAdjustmentReasonValue } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { BulkCreateInventoryItemDto } from './dto/bulk-create-inventory-item.dto';
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

type StockBuckets = { storeStock: number; salesStock: number; usageStock: number };

@Injectable()
export class InventoryService {
    private readonly logger = new Logger(InventoryService.name);

    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
        private approvalService: ApprovalService,
    ) { }

    // ── Stock-type helpers (Phase 2) ────────────────────────────────────
    // Every read/write against a specific bucket goes through these two,
    // rather than each call site re-deriving the field name -- one place
    // to get the STORE/SALES/USAGE <-> column mapping right.

    private stockField(stockType: StockType): 'storeStock' | 'salesStock' | 'usageStock' {
        if (stockType === StockType.STORE) return 'storeStock';
        if (stockType === StockType.SALES) return 'salesStock';
        return 'usageStock';
    }

    private getStockValue(item: StockBuckets, stockType: StockType): number {
        return item[this.stockField(stockType)];
    }

    private getTotalStock(item: StockBuckets): number {
        return item.storeStock + item.salesStock + item.usageStock;
    }

    /**
     * Returns a properly-shaped partial update object rather than a
     * computed/dynamic property key -- Prisma's generated update-input
     * types don't reliably accept `{ [field]: value }` without an unsafe
     * cast, so this switches explicitly instead. `value` can be a plain
     * number (adjustment's absolute set) or a Prisma increment/decrement
     * operator object (transfer, deduct-for-sale).
     */
    private stockFieldUpdate(stockType: StockType, value: number | { increment: number } | { decrement: number }) {
        if (stockType === StockType.STORE) return { storeStock: value };
        if (stockType === StockType.SALES) return { salesStock: value };
        return { usageStock: value };
    }

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
        if (dto.productId) {
            const product = await this.prisma.inventoryProduct.findUnique({ where: { id: dto.productId } });
            if (!product) throw new BadRequestException('Product master record not found');
        }

        return this.prisma.inventoryItem.create({
            data: {
                name: dto.name,
                category: dto.category,
                branchId,
                supplierId: dto.supplierId,
                productId: dto.productId,
                unit: dto.unit,
                lowStockThreshold: dto.lowStockThreshold ?? 5,
                // New stock always starts unallocated in Store, per the
                // spec's Stock Allocation section -- allocating into
                // Sales/Usage is a separate, explicit step afterward.
                storeStock: dto.initialQuantity ?? 0,
                expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
                price: dto.category === 'FOR_SALE' ? dto.price : (dto.price ?? undefined),
            },
        });
    }

    /**
     * Creates one InventoryItem row per selected branch, each with its own
     * independent starting quantity — InventoryItem is branch-scoped, so
     * "the same item across several branches" is genuinely several rows,
     * not one row shared between them. A branch that already has this
     * exact name+category combination is skipped rather than failing the
     * whole request — the admin gets back exactly what was created and
     * what was skipped, rather than having one pre-existing duplicate
     * block every other branch in the selection.
     *
     * Restored here after being silently dropped by an earlier full-file
     * rewrite of this service that was working from a stale copy -- the
     * only change from the original is storeStock in place of the
     * now-removed currentQuantity field, matching Phase 2's Store/Sales/
     * Usage split; the rest of the logic is untouched.
     */
    async createItemForBranches(dto: BulkCreateInventoryItemDto) {
        if (dto.category === 'FOR_SALE' && (dto.price === undefined || dto.price === null)) {
            throw new BadRequestException('A price is required for items in the "For Sale" category');
        }

        const created: Array<{ branchId: string; id: string }> = [];
        const skipped: Array<{ branchId: string; reason: string }> = [];

        for (const entry of dto.branches) {
            const existing = await this.prisma.inventoryItem.findFirst({
                where: { branchId: entry.branchId, name: dto.name, category: dto.category },
            });
            if (existing) {
                skipped.push({ branchId: entry.branchId, reason: 'An item with this name and category already exists at this branch' });
                continue;
            }

            const item = await this.prisma.inventoryItem.create({
                data: {
                    name: dto.name,
                    category: dto.category,
                    branchId: entry.branchId,
                    supplierId: dto.supplierId,
                    unit: dto.unit,
                    lowStockThreshold: dto.lowStockThreshold ?? 5,
                    storeStock: entry.initialQuantity ?? 0,
                    expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
                    price: dto.category === 'FOR_SALE' ? dto.price : (dto.price ?? undefined),
                },
            });
            created.push({ branchId: entry.branchId, id: item.id });
        }

        return { createdCount: created.length, skippedCount: skipped.length, created, skipped };
    }

    async updateItem(id: string, dto: UpdateInventoryItemDto) {
        const item = await this.findOne(id);
        const nextCategory = dto.category ?? item.category;
        const nextPrice = dto.price !== undefined ? dto.price : Number(item.price ?? 0) || undefined;

        if (nextCategory === 'FOR_SALE' && !nextPrice) {
            throw new BadRequestException('A price is required for items in the "For Sale" category');
        }
        if (dto.productId) {
            const product = await this.prisma.inventoryProduct.findUnique({ where: { id: dto.productId } });
            if (!product) throw new BadRequestException('Product master record not found');
        }

        return this.prisma.inventoryItem.update({
            where: { id },
            data: {
                name: dto.name,
                category: dto.category,
                ...(dto.supplierId !== undefined && { supplierId: dto.supplierId }),
                ...(dto.productId !== undefined && { productId: dto.productId }),
                unit: dto.unit,
                lowStockThreshold: dto.lowStockThreshold,
                expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
                price: dto.price !== undefined ? dto.price : undefined,
            },
        });
    }

    async findAll(query: QueryInventoryDto) {
        const { search, branchId, category, lowStockOnly, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: Prisma.InventoryItemWhereInput = {
            isActive: true,
            ...(branchId && { branchId }),
            ...(category && { category }),
            ...(search && { name: { contains: search, mode: 'insensitive' } }),
        };

        // Prisma can't compare two columns directly in `where` without a raw query;
        // for lowStockOnly, filter in application code instead of the DB when needed.
        const items = await this.prisma.inventoryItem.findMany({
            where,
            include: { branch: { select: { id: true, name: true } }, supplier: { select: { id: true, name: true, type: true } } },
            orderBy: { name: 'asc' },
        });

        const filtered = lowStockOnly
            ? items.filter((i) => this.getTotalStock(i) <= i.lowStockThreshold)
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

    /** Full movement history for a single item — receipts, sales, adjustments, transfers in/out. */
    async getMovementHistory(itemId: string, page = 1, limit = 50) {
        await this.findOne(itemId); // 404s if the item doesn't exist
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.stockMovement.findMany({
                where: { itemId },
                include: { performedBy: { select: { id: true, name: true } } },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.stockMovement.count({ where: { itemId } }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    /** Movement log across every item, optionally scoped to a branch or movement type — for a global audit view. */
    async getAllMovements(params: { branchId?: string; type?: string; page?: number; limit?: number }) {
        const { branchId, type, page = 1, limit = 50 } = params;
        const skip = (page - 1) * limit;

        const where: Prisma.StockMovementWhereInput = {
            ...(type && { type: type as StockMovementType }),
            ...(branchId && { item: { branchId } }),
        };

        const [data, total] = await Promise.all([
            this.prisma.stockMovement.findMany({
                where,
                include: {
                    item: { select: { id: true, name: true, branch: { select: { id: true, name: true } } } },
                    performedBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.stockMovement.count({ where }),
        ]);

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    async receiveGoods(itemId: string, dto: ReceiveGoodsDto, staffId: string) {
        const item = await this.findOne(itemId);

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                // Received goods always land in Store (unallocated) --
                // matches createItem's same convention.
                data: { storeStock: { increment: dto.quantity } },
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.RECEIVED,
                    stockType: StockType.STORE,
                    quantityDelta: dto.quantity,
                    performedById: staffId,
                    reason: dto.note,
                },
            }),
        ]);

        return updated;
    }

    /** The actual stock mutation — only ever called once an adjustment is approved (or by an elevated Admin submitting one, which auto-approves). */
    private async applyAdjustment(itemId: string, stockType: StockType, quantityDelta: number, reasonCategory: StockAdjustmentReasonValue, reason: string | null, staffId: string | undefined) {
        const item = await this.findOne(itemId);
        const newQuantity = this.getStockValue(item, stockType) + quantityDelta;

        if (newQuantity < 0) {
            throw new BadRequestException(`Adjustment would result in negative ${stockType.toLowerCase()} stock — not permitted`);
        }

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                data: this.stockFieldUpdate(stockType, newQuantity),
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.ADJUSTMENT,
                    stockType,
                    quantityDelta,
                    performedById: staffId,
                    reasonCategory,
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
                stockType: dto.stockType,
                quantityDelta: dto.quantityDelta,
                reasonCategory: dto.reasonCategory,
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
        await this.applyAdjustment(request.itemId, request.stockType, request.quantityDelta, request.reasonCategory, request.reason, actorId);

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
     * stockType is a required, explicit parameter rather than a silent
     * default -- forces every caller to actually decide which bucket a
     * given deduction comes from (e.g. a retail sale vs. a service using
     * up product) rather than risk a default being wrong for one of them.
     */
    async deductForSale(itemId: string, stockType: StockType, quantity: number, referenceId?: string) {
        const item = await this.findOne(itemId);
        const available = this.getStockValue(item, stockType);

        if (available < quantity) {
            throw new BadRequestException(
                `Insufficient ${stockType.toLowerCase()} stock for "${item.name}" — ${available} available, ${quantity} requested`,
            );
        }

        const [updated] = await this.prisma.$transaction([
            this.prisma.inventoryItem.update({
                where: { id: itemId },
                data: this.stockFieldUpdate(stockType, { decrement: quantity }),
            }),
            this.prisma.stockMovement.create({
                data: {
                    itemId,
                    type: StockMovementType.SOLD,
                    stockType,
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
        if (!item || this.getTotalStock(item) > item.lowStockThreshold) return;

        const openAlert = await this.prisma.lowStockAlert.findFirst({
            where: { itemId, resolvedAt: null },
        });
        if (openAlert) return; // already alerted, don't spam a new one

        const alert = await this.prisma.lowStockAlert.create({
            data: { itemId },
        });

        this.notifyStage(item.name, LowStockAlertStage.SUPERVISOR, this.getTotalStock(item), item.lowStockThreshold)
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
            where: {
                expiryDate: { not: null, lte: warningCutoff },
                // Prisma can't compare "sum of three columns > 0" directly --
                // any bucket having stock is enough to warrant an expiry check.
                OR: [{ storeStock: { gt: 0 } }, { salesStock: { gt: 0 } }, { usageStock: { gt: 0 } }],
            },
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

            this.notifyStage(alert.item.name, nextStage, this.getTotalStock(alert.item), alert.item.lowStockThreshold)
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
        const available = this.getStockValue(fromItem, dto.stockType);
        if (available < dto.quantity) {
            throw new BadRequestException(
                `Insufficient ${dto.stockType.toLowerCase()} stock — ${available} available, ${dto.quantity} requested`,
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
                stockType: dto.stockType,
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
        if (!currentFromItem || this.getStockValue(currentFromItem, transfer.stockType) < transfer.quantity) {
            throw new BadRequestException(`Source item no longer has sufficient ${transfer.stockType.toLowerCase()} stock for this transfer`);
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
                data: this.stockFieldUpdate(transfer.stockType, { decrement: transfer.quantity }),
            });

            if (!toItem) {
                // storeStock/salesStock/usageStock all default to 0 via the
                // schema -- no need to set them explicitly here, only the
                // fields that actually differ from that default.
                toItem = await tx.inventoryItem.create({
                    data: {
                        name: currentFromItem.name,
                        category: currentFromItem.category,
                        branchId: transfer.toBranchId,
                        unit: currentFromItem.unit,
                        lowStockThreshold: currentFromItem.lowStockThreshold,
                    },
                });
            }

            // A transfer never changes bucket, only branch -- the
            // destination receives stock into the SAME stock type it left
            // the source in.
            await tx.inventoryItem.update({
                where: { id: toItem.id },
                data: this.stockFieldUpdate(transfer.stockType, { increment: transfer.quantity }),
            });

            await tx.stockMovement.createMany({
                data: [
                    {
                        itemId: transfer.fromItemId,
                        type: StockMovementType.TRANSFER_OUT,
                        stockType: transfer.stockType,
                        quantityDelta: -transfer.quantity,
                        referenceId: transfer.id,
                        performedById: actorId,
                    },
                    {
                        itemId: toItem.id,
                        type: StockMovementType.TRANSFER_IN,
                        stockType: transfer.stockType,
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