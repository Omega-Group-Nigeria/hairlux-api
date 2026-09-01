import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalRequestType, ApprovalStatus, PurchaseRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalService } from '../approval/approval.service';
import { UpsertPurchaseRequestDto } from './dto/upsert-purchase-request.dto';

const EDITABLE_STATUSES: PurchaseRequestStatus[] = [PurchaseRequestStatus.DRAFT];
// Dev Feedback Round 6, item #9. Broader than EDITABLE_STATUSES --
// deleting a dead/terminal request (never approved, nothing was ever
// ordered against it) is safe even though editing it wouldn't make
// sense. APPROVED is deliberately excluded: an approved request has a
// linked Purchase record, which the DB itself would also reject via a
// RESTRICT foreign key even if this guard were somehow bypassed.
const DELETABLE_STATUSES: PurchaseRequestStatus[] = [PurchaseRequestStatus.DRAFT, PurchaseRequestStatus.REJECTED, PurchaseRequestStatus.CANCELLED];

@Injectable()
export class PurchaseRequestService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly approvalService: ApprovalService,
    ) { }

    /**
     * "Last approved purchase price" per spec §4.1 -- derived from the
     * most recent PurchaseLine for this product, since that's what
     * PurchaseLine.unitPrice always represents (locked in at conversion
     * from an approved request). No separate "reference price" field is
     * kept on InventoryProduct at all -- this query IS the reference
     * price, always current by construction, never a value that can go
     * stale relative to what actually happened.
     */
    async getLastApprovedPrice(productId: string): Promise<number | null> {
        const lastLine = await this.prisma.purchaseLine.findFirst({
            where: { productId },
            orderBy: { purchase: { purchaseDate: 'desc' } },
        });
        return lastLine ? Number(lastLine.unitPrice) : null;
    }

    async findAll(filters: { branchId?: string; vendorId?: string; status?: PurchaseRequestStatus; search?: string; from?: Date; to?: Date }) {
        return this.prisma.purchaseRequest.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.vendorId && { vendorId: filters.vendorId }),
                ...(filters.status && { status: filters.status }),
                // requestNumber is a plain Int (no year embedded in the
                // stored value -- only in its "PR-2026-000123" display
                // formatting) -- same approach as Purchase.findAll's own
                // search, see that method's comment for why this pulls
                // the last digit run rather than stripping all non-digits.
                ...(filters.search && { requestNumber: Number((filters.search.match(/(\d+)(?!.*\d)/) || [])[0]) || -1 }),
                // No separate "request date" field exists (unlike
                // Purchase.purchaseDate) -- createdAt is the only
                // meaningful date a request actually has.
                ...((filters.from || filters.to) && {
                    createdAt: {
                        ...(filters.from && { gte: filters.from }),
                        ...(filters.to && { lte: filters.to }),
                    },
                }),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                branch: { select: { id: true, name: true } },
                vendor: { select: { id: true, name: true } },
                requestedBy: { select: { id: true, name: true } },
                lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
            },
        });
    }

    async findOne(id: string) {
        const request = await this.prisma.purchaseRequest.findUnique({
            where: { id },
            include: {
                branch: { select: { id: true, name: true } },
                vendor: { select: { id: true, name: true } },
                requestedBy: { select: { id: true, name: true } },
                lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
                approvalRequest: { include: { actions: { orderBy: { actedAt: 'asc' } } } },
                purchase: { select: { id: true, purchaseNumber: true, status: true } },
            },
        });
        if (!request) throw new NotFoundException('Purchase request not found');
        return request;
    }

    /**
     * Procurement/Inventory/Finance Integration, Phase 7: "Alert items can
     * be multi-selected and pushed directly into a new Purchase Request
     * (suggested quantity + last purchase price pre-filled) -- this is the
     * loop that closes Inventory back to Procurement." Creates an actual
     * DRAFT PurchaseRequest (per Phase 1's own status list) rather than
     * just returning a computed payload -- the admin still reviews/edits
     * quantities and prices before submitting it (DRAFT is the only
     * editable status, see EDITABLE_STATUSES above), exactly like any
     * other purchase request.
     */
    async createFromAlerts(
        params: { lowStockAlertIds?: string[]; expiryAlertIds?: string[]; vendorId: string; reason?: string },
        requestedById: string | undefined,
    ) {
        const lowStockAlertIds = params.lowStockAlertIds ?? [];
        const expiryAlertIds = params.expiryAlertIds ?? [];
        if (!lowStockAlertIds.length && !expiryAlertIds.length) {
            throw new BadRequestException('Select at least one alert to push into a purchase request');
        }

        const [lowStockAlerts, expiryAlerts] = await Promise.all([
            this.prisma.lowStockAlert.findMany({
                where: { id: { in: lowStockAlertIds } },
                include: { item: { include: { product: true } } },
            }),
            this.prisma.expiryAlert.findMany({
                where: { id: { in: expiryAlertIds } },
                include: { item: { include: { product: true } } },
            }),
        ]);

        const allAlerts = [...lowStockAlerts, ...expiryAlerts];
        if (allAlerts.length !== lowStockAlertIds.length + expiryAlertIds.length) {
            throw new BadRequestException('One or more selected alerts do not exist');
        }
        if (allAlerts.some((a) => a.resolvedAt)) {
            throw new BadRequestException('One or more selected alerts have already been resolved');
        }
        if (!allAlerts.every((a) => a.item.productId)) {
            const unlinkedNames = allAlerts.filter((a) => !a.item.productId).map((a) => a.item.name);
            throw new BadRequestException(
                `"${unlinkedNames.join('", "')}" ${unlinkedNames.length > 1 ? 'are' : 'is'} not linked to a product master record -- open the item on the Inventory Items page and set its "Linked Product" field, then try again`,
            );
        }
        const branchId = allAlerts[0].item.branchId;
        if (!allAlerts.every((a) => a.item.branchId === branchId)) {
            throw new BadRequestException('All selected alerts must be from the same branch -- a purchase request is per-branch');
        }

        // Dedupe by product -- the same product can have both a low-stock
        // and an expiry alert open on the same item at once.
        const itemsByProductId = new Map<string, any>();
        for (const alert of allAlerts) {
            if (alert.item.productId) itemsByProductId.set(alert.item.productId, alert.item);
        }

        const linesData = await Promise.all(
            Array.from(itemsByProductId.values()).map(async (item: any) => {
                const totalStock = item.storeStock + item.salesStock + item.usageStock;
                // Simple, transparent reorder heuristic: bring stock back up
                // to twice the low-stock threshold. Deliberately not a
                // demand-forecasting algorithm -- the spec asks for a
                // reasonable starting suggestion the admin reviews and can
                // freely override, not an automated purchasing decision.
                const suggestedQty = Math.max(1, item.lowStockThreshold * 2 - totalStock);
                const estimatedPrice = (await this.getLastApprovedPrice(item.productId)) ?? Number(item.product?.costPrice ?? 0);
                return {
                    productId: item.productId,
                    quantity: suggestedQty,
                    estimatedPrice,
                    lineTotal: estimatedPrice * suggestedQty,
                };
            }),
        );

        const grandTotal = linesData.reduce((sum, l) => sum + l.lineTotal, 0);

        return this.prisma.purchaseRequest.create({
            data: {
                branchId,
                vendorId: params.vendorId,
                reason: params.reason ?? 'Auto-generated from stock alerts',
                requestedById,
                status: PurchaseRequestStatus.DRAFT,
                grandTotal,
                lines: { create: linesData },
            },
            include: { lines: true },
        });
    }

    async create(dto: UpsertPurchaseRequestDto, requestedById: string | undefined) {
        const linesData = await Promise.all(dto.lines.map(async (line) => {
            const estimatedPrice = line.estimatedPrice ?? (await this.getLastApprovedPrice(line.productId));
            if (estimatedPrice == null) {
                throw new BadRequestException(
                    `No estimated price provided and no purchase history exists yet for this product -- an initial price must be entered manually.`,
                );
            }
            return {
                productId: line.productId,
                quantity: line.quantity,
                estimatedPrice,
                lineTotal: estimatedPrice * line.quantity,
            };
        }));

        const grandTotal = linesData.reduce((sum, l) => sum + l.lineTotal, 0);

        return this.prisma.purchaseRequest.create({
            data: {
                branchId: dto.branchId,
                vendorId: dto.vendorId,
                reason: dto.reason,
                attachmentUrl: dto.attachmentUrl,
                requestedById,
                grandTotal,
                lines: { create: linesData },
            },
            include: { lines: true },
        });
    }

    async update(id: string, dto: UpsertPurchaseRequestDto) {
        const existing = await this.prisma.purchaseRequest.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Purchase request not found');
        if (!EDITABLE_STATUSES.includes(existing.status)) {
            throw new BadRequestException(`Cannot edit -- request is already ${existing.status}. Only a Draft can be edited.`);
        }

        const linesData = await Promise.all(dto.lines.map(async (line) => {
            const estimatedPrice = line.estimatedPrice ?? (await this.getLastApprovedPrice(line.productId));
            if (estimatedPrice == null) {
                throw new BadRequestException(`No estimated price provided and no purchase history exists yet for this product.`);
            }
            return {
                productId: line.productId,
                quantity: line.quantity,
                estimatedPrice,
                lineTotal: estimatedPrice * line.quantity,
            };
        }));

        const grandTotal = linesData.reduce((sum, l) => sum + l.lineTotal, 0);

        return this.prisma.purchaseRequest.update({
            where: { id },
            data: {
                branchId: dto.branchId,
                vendorId: dto.vendorId,
                reason: dto.reason,
                attachmentUrl: dto.attachmentUrl,
                grandTotal,
                lines: { deleteMany: {}, create: linesData },
            },
            include: { lines: true },
        });
    }

    /** Dev Feedback Round 6, item #9. Only a Draft, Rejected, or Cancelled request can be deleted -- see DELETABLE_STATUSES. */
    async remove(id: string) {
        const existing = await this.prisma.purchaseRequest.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Purchase request not found');
        if (!DELETABLE_STATUSES.includes(existing.status)) {
            throw new BadRequestException(`Cannot delete -- request is ${existing.status}. Only a Draft, Rejected, or Cancelled request can be deleted.`);
        }
        await this.prisma.purchaseRequest.delete({ where: { id } });
    }

    /** Draft -> Pending. Creates the underlying ApprovalRequest -- routes through an admin-configured chain if one exists for PURCHASE_REQUEST, otherwise the original single-approver behavior. */
    async submit(id: string, submittedById: string | undefined) {
        const request = await this.prisma.purchaseRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Purchase request not found');
        if (request.status !== PurchaseRequestStatus.DRAFT) {
            throw new BadRequestException(`Cannot submit -- request is already ${request.status}.`);
        }

        const approvalRequest = await this.approvalService.create({
            requestType: ApprovalRequestType.PURCHASE_REQUEST,
            branchId: request.branchId,
            submittedById,
        });

        return this.prisma.purchaseRequest.update({
            where: { id },
            data: { status: PurchaseRequestStatus.PENDING, approvalRequestId: approvalRequest.id },
        });
    }

    /**
     * Orchestrates the generic ApprovalService call alongside this
     * domain's own status field -- same explicit-sync pattern already
     * used by InventoryService for Stock Adjustments/Transfers, not an
     * implicit/automatic mechanism.
     *
     * If the underlying chain still has stages remaining after this
     * action, approvalService.approve() returns the request still
     * PENDING (advanced to the next stage) -- reflected here as
     * UNDER_REVIEW, matching that status's defined meaning: at least one
     * stage has approved, chain not yet finished. Only a fully APPROVED
     * outcome triggers automatic conversion into a Purchase (spec §6).
     */
    async approve(id: string, actorId: string | undefined, isElevated: boolean, comment?: string) {
        const request = await this.prisma.purchaseRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Purchase request not found');
        if (!request.approvalRequestId) throw new BadRequestException('This request has not been submitted yet.');

        const updatedApproval = await this.approvalService.approve(request.approvalRequestId, actorId, isElevated, comment);

        if (updatedApproval.status === ApprovalStatus.APPROVED) {
            const approved = await this.prisma.purchaseRequest.update({
                where: { id },
                data: { status: PurchaseRequestStatus.APPROVED },
            });
            return this.convertToPurchase(approved.id);
        }

        return this.prisma.purchaseRequest.update({
            where: { id },
            data: { status: PurchaseRequestStatus.UNDER_REVIEW },
        });
    }

    async reject(id: string, actorId: string | undefined, isElevated: boolean, reason?: string) {
        const request = await this.prisma.purchaseRequest.findUnique({ where: { id } });
        if (!request) throw new NotFoundException('Purchase request not found');
        if (!request.approvalRequestId) throw new BadRequestException('This request has not been submitted yet.');

        await this.approvalService.reject(request.approvalRequestId, actorId, isElevated, reason);

        return this.prisma.purchaseRequest.update({
            where: { id },
            data: { status: PurchaseRequestStatus.REJECTED },
        });
    }

    /**
     * Spec §6: "An approved Purchase Request should convert into a
     * Purchase automatically. Do not require the user to recreate the
     * products." Lines are copied, not referenced -- locking in the
     * price at this exact moment, since a later edit to the product's
     * price must never retroactively change an already-approved purchase.
     */
    private async convertToPurchase(purchaseRequestId: string) {
        const request = await this.prisma.purchaseRequest.findUnique({
            where: { id: purchaseRequestId },
            include: { lines: true },
        });
        if (!request) throw new NotFoundException('Purchase request not found');

        return this.prisma.purchase.create({
            data: {
                purchaseRequestId: request.id,
                branchId: request.branchId,
                vendorId: request.vendorId,
                grandTotal: request.grandTotal,
                lines: {
                    create: request.lines.map((line: { productId: string; quantity: number; estimatedPrice: any; lineTotal: any }) => ({
                        productId: line.productId,
                        quantity: line.quantity,
                        unitPrice: line.estimatedPrice,
                        lineTotal: line.lineTotal,
                    })),
                },
            },
            include: { lines: true },
        });
    }
}