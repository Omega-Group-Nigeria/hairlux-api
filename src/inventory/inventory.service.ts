import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
    LowStockAlertStage,
    Prisma,
    StockMovementType,
    StockTransferStatus
} from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { RejectTransferDto } from './dto/reject-transfer.dto';
import { RequestTransferDto } from './dto/request-transfer.dto';

const ESCALATION_WINDOW_HOURS = 6;
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
    ) { }

    async createItem(dto: CreateInventoryItemDto, branchId: string) {
        const existing = await this.prisma.inventoryItem.findFirst({
            where: { branchId, name: dto.name, category: dto.category },
        });
        if (existing) {
            throw new BadRequestException('An item with this name and category already exists at this branch');
        }

        return this.prisma.inventoryItem.create({
            data: {
                name: dto.name,
                category: dto.category,
                branchId,
                unit: dto.unit,
                lowStockThreshold: dto.lowStockThreshold ?? 5,
                currentQuantity: dto.initialQuantity ?? 0,
                expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
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
            include: { branch: { select: { id: true, name: true } } },
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
            include: { branch: { select: { id: true, name: true } } },
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

    async adjustStock(itemId: string, dto: AdjustStockDto, staffId: string) {
        const item = await this.findOne(itemId);
        const newQuantity = item.currentQuantity + dto.quantityDelta;

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
                    quantityDelta: dto.quantityDelta,
                    performedById: staffId,
                    reason: dto.reason,
                },
            }),
        ]);

        if (dto.quantityDelta < 0) {
            await this.checkAndTriggerLowStockAlert(itemId);
        }

        return updated;
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

    private async checkAndTriggerLowStockAlert(itemId: string) {
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

    async resolveAlert(alertId: string, staffId: string) {
        const alert = await this.prisma.lowStockAlert.findUnique({ where: { id: alertId } });
        if (!alert) throw new NotFoundException('Alert not found');
        if (alert.resolvedAt) throw new BadRequestException('Alert already resolved');

        return this.prisma.lowStockAlert.update({
            where: { id: alertId },
            data: { resolvedAt: new Date(), resolvedById: staffId },
        });
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

        return this.prisma.stockTransfer.create({
            data: {
                fromItemId: dto.fromItemId,
                toBranchId: dto.toBranchId,
                quantity: dto.quantity,
                requestedById,
            },
        });
    }

    async approveTransfer(transferId: string, approvedById: string) {
        const transfer = await this.prisma.stockTransfer.findUnique({
            where: { id: transferId },
            include: { fromItem: true },
        });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.PENDING) {
            throw new BadRequestException(`Cannot approve — transfer is already ${transfer.status}`);
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
                        performedById: approvedById,
                    },
                    {
                        itemId: toItem.id,
                        type: StockMovementType.TRANSFER_IN,
                        quantityDelta: transfer.quantity,
                        referenceId: transfer.id,
                        performedById: approvedById,
                    },
                ],
            });

            await tx.stockTransfer.update({
                where: { id: transferId },
                data: {
                    status: StockTransferStatus.COMPLETED,
                    approvedById,
                    approvedAt: now,
                    completedAt: now,
                },
            });
        });

        await this.checkAndTriggerLowStockAlert(transfer.fromItemId);

        return this.prisma.stockTransfer.findUnique({ where: { id: transferId } });
    }

    async rejectTransfer(transferId: string, dto: RejectTransferDto) {
        const transfer = await this.prisma.stockTransfer.findUnique({ where: { id: transferId } });
        if (!transfer) throw new NotFoundException('Transfer not found');
        if (transfer.status !== StockTransferStatus.PENDING) {
            throw new BadRequestException(`Cannot reject — transfer is already ${transfer.status}`);
        }

        return this.prisma.stockTransfer.update({
            where: { id: transferId },
            data: { status: StockTransferStatus.REJECTED, rejectionReason: dto.reason },
        });
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