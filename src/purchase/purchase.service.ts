import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasePaymentStatus, PurchaseStatus, StockMovementType, StockType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialTransactionService } from '../finance/financial-transaction.service';
import { RecordPurchasePaymentDto } from './dto/record-purchase-payment.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { AcceptGoodsDto } from './dto/accept-goods.dto';

@Injectable()
export class PurchaseService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly financialTransactionService: FinancialTransactionService,
    ) { }

    async findAll(filters: { branchId?: string; vendorId?: string; status?: PurchaseStatus; search?: string; from?: Date; to?: Date }) {
        return this.prisma.purchase.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.vendorId && { vendorId: filters.vendorId }),
                ...(filters.status && { status: filters.status }),
                // purchaseNumber is a plain Int (no year embedded in the
                // stored value -- only in its "PO-2026-000123" display
                // formatting), so pull the last digit run out of whatever
                // the admin typed rather than stripping all non-digits
                // and concatenating them (which would wrongly fold a
                // typed year prefix into the number itself).
                ...(filters.search && { purchaseNumber: Number((filters.search.match(/(\d+)(?!.*\d)/) || [])[0]) || -1 }),
                ...((filters.from || filters.to) && {
                    purchaseDate: {
                        ...(filters.from && { gte: filters.from }),
                        ...(filters.to && { lte: filters.to }),
                    },
                }),
            },
            orderBy: { createdAt: 'desc' },
            include: {
                branch: { select: { id: true, name: true } },
                vendor: { select: { id: true, name: true } },
                lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
            },
        });
    }

    async findOne(id: string) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id },
            include: {
                branch: { select: { id: true, name: true } },
                vendor: { select: { id: true, name: true } },
                lines: { include: { product: { select: { id: true, name: true, sku: true } } } },
                payments: { orderBy: { paymentDate: 'desc' } },
                goodsReceipts: { include: { lines: true }, orderBy: { receivedDate: 'desc' } },
            },
        });
        if (!purchase) throw new NotFoundException('Purchase not found');
        return purchase;
    }

    private determinePaymentStatus(amountPaid: number, grandTotal: number): PurchasePaymentStatus {
        if (amountPaid <= 0) return PurchasePaymentStatus.UNPAID;
        if (amountPaid < grandTotal) return PurchasePaymentStatus.PARTIALLY_PAID;
        if (amountPaid === grandTotal) return PurchasePaymentStatus.FULLY_PAID;
        return PurchasePaymentStatus.OVERPAID;
    }

    /**
     * Every payment automatically creates a matching FinancialTransaction
     * OUTFLOW (spec §7) -- recorded inside the same transaction as the
     * payment itself and the running amountPaid update, so all three
     * either commit together or none do. Overpayment is a valid, tracked
     * outcome per the spec's own PurchasePaymentStatus.OVERPAID, not
     * something blocked here.
     */
    async recordPayment(purchaseId: string, dto: RecordPurchasePaymentDto, recordedById: string | undefined) {
        const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
        if (!purchase) throw new NotFoundException('Purchase not found');

        const newAmountPaid = Number(purchase.amountPaid) + dto.amount;
        const newPaymentStatus = this.determinePaymentStatus(newAmountPaid, Number(purchase.grandTotal));

        return this.prisma.$transaction(async (tx) => {
            const financialTransaction = await this.financialTransactionService.record(
                {
                    direction: 'OUTFLOW',
                    category: 'VENDOR_PAYMENT',
                    amount: dto.amount,
                    branchId: purchase.branchId,
                    description: `Vendor payment — Purchase #${purchase.purchaseNumber}`,
                    paymentMethod: dto.paymentMethod,
                    recordedById,
                    sourceType: 'Purchase',
                    sourceId: purchase.id,
                },
                tx,
            );

            const payment = await tx.purchasePayment.create({
                data: {
                    purchaseId,
                    amount: dto.amount,
                    paymentMethod: dto.paymentMethod,
                    paymentDate: new Date(dto.paymentDate),
                    paymentReference: dto.paymentReference,
                    recordedById,
                    financialTransactionId: financialTransaction.id,
                },
            });

            await tx.purchase.update({
                where: { id: purchaseId },
                data: { amountPaid: newAmountPaid, paymentStatus: newPaymentStatus },
            });

            return payment;
        });
    }

    /**
     * Spec §8's critical business rule: creating a Purchase never
     * increases stock -- only a confirmed receipt does, and only the
     * Accepted Quantity of it, always into Store (unallocated), per the
     * Phase 2 allocation rule. Multiple partial deliveries against one
     * Purchase are the normal case, not an edge case -- cumulative
     * delivered quantity per line is validated against what was
     * originally ordered on every call, across every receipt so far.
     */
    /**
 * Dev Feedback Round 9: this used to ALSO take acceptedQty and credit
 * inventory in the same action -- now purely records what physically
 * arrived (delivered/damaged). Accepting it into usable inventory is
 * the separate acceptGoods() action below, matching the new Pending
 * -> Received -> Fully Accepted status flow.
 */
    async receiveGoods(purchaseId: string, dto: ReceiveGoodsDto, receivedById: string | undefined) {
        const purchase = await this.prisma.purchase.findUnique({
            where: { id: purchaseId },
            include: {
                lines: { include: { goodsReceiptLines: true } },
            },
        });
        if (!purchase) throw new NotFoundException('Purchase not found');

        const lineById = new Map(purchase.lines.map((l) => [l.id, l]));

        for (const receiptLine of dto.lines) {
            const purchaseLine = lineById.get(receiptLine.purchaseLineId);
            if (!purchaseLine) {
                throw new BadRequestException(`Purchase line ${receiptLine.purchaseLineId} does not belong to this purchase.`);
            }

            const damaged = receiptLine.damagedQty ?? 0;
            if (damaged > receiptLine.deliveredQty) {
                throw new BadRequestException(
                    `For product line ${receiptLine.purchaseLineId}: damaged (${damaged}) cannot exceed delivered (${receiptLine.deliveredQty}).`,
                );
            }

            const previouslyDelivered = purchaseLine.goodsReceiptLines.reduce((sum, l) => sum + l.deliveredQty, 0);
            const cumulativeDelivered = previouslyDelivered + receiptLine.deliveredQty;
            if (cumulativeDelivered > purchaseLine.quantity) {
                throw new BadRequestException(
                    `For product line ${receiptLine.purchaseLineId}: this delivery would bring total delivered to ${cumulativeDelivered}, exceeding the ${purchaseLine.quantity} originally ordered.`,
                );
            }
        }

        return this.prisma.$transaction(async (tx) => {
            const receipt = await tx.goodsReceipt.create({
                data: { purchaseId, receivedById },
            });

            for (const receiptLine of dto.lines) {
                await tx.goodsReceiptLine.create({
                    data: {
                        goodsReceiptId: receipt.id,
                        purchaseLineId: receiptLine.purchaseLineId,
                        deliveredQty: receiptLine.deliveredQty,
                        damagedQty: receiptLine.damagedQty ?? 0,
                        // acceptedQty/acceptedAt/acceptedById deliberately
                        // left at their defaults (0/null/null) -- this
                        // line now needs the separate Accept Products
                        // action before anything from it enters inventory.
                        batchLotNumber: receiptLine.batchLotNumber,
                        expiryDate: receiptLine.expiryDate ? new Date(receiptLine.expiryDate) : undefined,
                    },
                });
            }

            // Recompute overall Purchase status from cumulative delivered
            // vs. ordered across every line, not just the lines touched by
            // this specific receipt.
            const allReceiptLines = await tx.goodsReceiptLine.findMany({
                where: { purchaseLine: { purchaseId } },
                select: { purchaseLineId: true, deliveredQty: true },
            });
            const deliveredByLine = new Map<string, number>();
            for (const rl of allReceiptLines) {
                deliveredByLine.set(rl.purchaseLineId, (deliveredByLine.get(rl.purchaseLineId) ?? 0) + rl.deliveredQty);
            }
            const fullyReceived = purchase.lines.every((l) => (deliveredByLine.get(l.id) ?? 0) >= l.quantity);
            const anyReceived = purchase.lines.some((l) => (deliveredByLine.get(l.id) ?? 0) > 0);

            await tx.purchase.update({
                where: { id: purchaseId },
                data: {
                    status: fullyReceived
                        ? PurchaseStatus.FULLY_RECEIVED
                        : anyReceived
                            ? PurchaseStatus.PARTIALLY_RECEIVED
                            : purchase.status,
                    // Dev Feedback Round 9: a delivery arriving always
                    // means "there's now something to review" -- moves
                    // PENDING -> RECEIVED. Never moves it BACKWARD from
                    // FULLY_ACCEPTED to RECEIVED just because a further,
                    // separate delivery came in against the same purchase
                    // (a real scenario -- multiple partial deliveries are
                    // normal) -- that new delivery's own lines correctly
                    // still need their own review, but acceptGoods()
                    // recomputes acceptanceStatus fresh from ALL receipt
                    // lines' review state every time it runs, so an
                    // already-FULLY_ACCEPTED purchase would only actually
                    // move back to RECEIVED once acceptGoods next runs and
                    // finds this new, still-unreviewed line -- setting it
                    // eagerly here too (rather than leaving a stale
                    // FULLY_ACCEPTED sitting alongside a newly-unreviewed
                    // line until the next accept action) is what keeps the
                    // status honest in the meantime.
                    acceptanceStatus: purchase.acceptanceStatus === 'PENDING' ? 'RECEIVED' : purchase.acceptanceStatus === 'FULLY_ACCEPTED' ? 'RECEIVED' : purchase.acceptanceStatus,
                },
            });

            return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { lines: true } });
        });
    }

    /**
     * Dev Feedback Round 9: the "Accept Products" action -- the second,
     * separate step of the new Pending -> Received -> Fully Accepted
     * flow. Reviews specific still-pending goods receipt lines (a line
     * that already has acceptedAt set can't be re-accepted -- each line
     * is reviewed exactly once) and, for whatever's actually accepted,
     * credits it into usable inventory -- this is where that crediting
     * logic moved to, out of receiveGoods.
     */
    async acceptGoods(purchaseId: string, dto: AcceptGoodsDto, acceptedById: string | undefined) {
        const purchase = await this.prisma.purchase.findUnique({ where: { id: purchaseId } });
        if (!purchase) throw new NotFoundException('Purchase not found');

        const receiptLines = await this.prisma.goodsReceiptLine.findMany({
            where: { goodsReceipt: { purchaseId } },
            include: { purchaseLine: true },
        });
        const receiptLineById = new Map(receiptLines.map((l) => [l.id, l]));

        for (const acceptLine of dto.lines) {
            const receiptLine = receiptLineById.get(acceptLine.goodsReceiptLineId);
            if (!receiptLine) {
                throw new BadRequestException(`Goods receipt line ${acceptLine.goodsReceiptLineId} does not belong to this purchase.`);
            }
            if (receiptLine.acceptedAt) {
                throw new BadRequestException(`Goods receipt line ${acceptLine.goodsReceiptLineId} has already been reviewed.`);
            }
            const maxAcceptable = receiptLine.deliveredQty - receiptLine.damagedQty;
            if (acceptLine.acceptedQty > maxAcceptable) {
                throw new BadRequestException(
                    `For receipt line ${acceptLine.goodsReceiptLineId}: accepted (${acceptLine.acceptedQty}) cannot exceed delivered minus damaged (${maxAcceptable}).`,
                );
            }
        }

        return this.prisma.$transaction(async (tx) => {
            for (const acceptLine of dto.lines) {
                const receiptLine = receiptLineById.get(acceptLine.goodsReceiptLineId)!;

                await tx.goodsReceiptLine.update({
                    where: { id: receiptLine.id },
                    data: { acceptedQty: acceptLine.acceptedQty, acceptedAt: new Date(), acceptedById },
                });

                if (acceptLine.acceptedQty > 0) {
                    // Find-or-create the branch's InventoryItem for this
                    // product -- same pattern InventoryService.approveTransfer
                    // already uses for a destination branch that has never
                    // stocked this item before.
                    let item = await tx.inventoryItem.findFirst({
                        where: { branchId: purchase.branchId, productId: receiptLine.purchaseLine.productId },
                    });

                    if (!item) {
                        const product = await tx.inventoryProduct.findUnique({ where: { id: receiptLine.purchaseLine.productId } });
                        if (!product) throw new NotFoundException('Product not found');
                        item = await tx.inventoryItem.create({
                            data: {
                                name: product.name,
                                category: product.category[0] ?? 'FOR_SALE',
                                branchId: purchase.branchId,
                                productId: product.id,
                                unit: product.unit,
                                lowStockThreshold: product.lowStockThreshold,
                                price: product.sellingPrice,
                                expiryDate: receiptLine.expiryDate ?? undefined,
                            },
                        });
                    }

                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { storeStock: { increment: acceptLine.acceptedQty } },
                    });

                    await tx.stockMovement.create({
                        data: {
                            itemId: item.id,
                            type: StockMovementType.RECEIVED,
                            stockType: StockType.STORE,
                            quantityDelta: acceptLine.acceptedQty,
                            referenceId: receiptLine.goodsReceiptId,
                            performedById: acceptedById,
                            reason: `Product acceptance for Purchase #${purchase.purchaseNumber}`,
                        },
                    });
                }
            }

            // Recomputed fresh from ALL receipt lines' review state every
            // time, not just the ones touched by this call -- FULLY_ACCEPTED
            // only once every line across every delivery for this purchase
            // has been reviewed, matching how the overall PurchaseStatus
            // above is recomputed from cumulative totals, not just this call's own lines.
            const allLines = await tx.goodsReceiptLine.findMany({
                where: { goodsReceipt: { purchaseId } },
                select: { acceptedAt: true },
            });
            const allReviewed = allLines.length > 0 && allLines.every((l) => l.acceptedAt != null);

            await tx.purchase.update({
                where: { id: purchaseId },
                data: { acceptanceStatus: allReviewed ? 'FULLY_ACCEPTED' : 'RECEIVED' },
            });

            return tx.goodsReceiptLine.findMany({
                where: { goodsReceipt: { purchaseId } },
                include: { purchaseLine: { include: { product: true } } },
            });
        });
    }
}