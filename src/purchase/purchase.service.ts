import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PurchasePaymentStatus, PurchaseStatus, StockMovementType, StockType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialTransactionService } from '../finance/financial-transaction.service';
import { RecordPurchasePaymentDto } from './dto/record-purchase-payment.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';

@Injectable()
export class PurchaseService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly financialTransactionService: FinancialTransactionService,
    ) { }

    async findAll(filters: { branchId?: string; vendorId?: string; status?: PurchaseStatus }) {
        return this.prisma.purchase.findMany({
            where: {
                ...(filters.branchId && { branchId: filters.branchId }),
                ...(filters.vendorId && { vendorId: filters.vendorId }),
                ...(filters.status && { status: filters.status }),
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
            if (receiptLine.acceptedQty + damaged > receiptLine.deliveredQty) {
                throw new BadRequestException(
                    `For product line ${receiptLine.purchaseLineId}: accepted (${receiptLine.acceptedQty}) + damaged (${damaged}) cannot exceed delivered (${receiptLine.deliveredQty}).`,
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
                const purchaseLine = lineById.get(receiptLine.purchaseLineId)!;

                await tx.goodsReceiptLine.create({
                    data: {
                        goodsReceiptId: receipt.id,
                        purchaseLineId: receiptLine.purchaseLineId,
                        deliveredQty: receiptLine.deliveredQty,
                        damagedQty: receiptLine.damagedQty ?? 0,
                        acceptedQty: receiptLine.acceptedQty,
                        batchLotNumber: receiptLine.batchLotNumber,
                        expiryDate: receiptLine.expiryDate ? new Date(receiptLine.expiryDate) : undefined,
                    },
                });

                if (receiptLine.acceptedQty > 0) {
                    // Find-or-create the branch's InventoryItem for this
                    // product -- same pattern InventoryService.approveTransfer
                    // already uses for a destination branch that has never
                    // stocked this item before.
                    let item = await tx.inventoryItem.findFirst({
                        where: { branchId: purchase.branchId, productId: purchaseLine.productId },
                    });

                    if (!item) {
                        const product = await tx.inventoryProduct.findUnique({ where: { id: purchaseLine.productId } });
                        if (!product) throw new NotFoundException('Product not found');
                        item = await tx.inventoryItem.create({
                            data: {
                                name: product.name,
                                category: product.category,
                                branchId: purchase.branchId,
                                productId: product.id,
                                unit: product.unit,
                                lowStockThreshold: product.lowStockThreshold,
                                price: product.sellingPrice,
                                expiryDate: receiptLine.expiryDate ? new Date(receiptLine.expiryDate) : undefined,
                            },
                        });
                    }

                    await tx.inventoryItem.update({
                        where: { id: item.id },
                        data: { storeStock: { increment: receiptLine.acceptedQty } },
                    });

                    await tx.stockMovement.create({
                        data: {
                            itemId: item.id,
                            type: StockMovementType.RECEIVED,
                            stockType: StockType.STORE,
                            quantityDelta: receiptLine.acceptedQty,
                            referenceId: receipt.id,
                            performedById: receivedById,
                            reason: `Goods receipt for Purchase #${purchase.purchaseNumber}`,
                        },
                    });
                }
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
                },
            });

            return tx.goodsReceipt.findUnique({ where: { id: receipt.id }, include: { lines: true } });
        });
    }
}