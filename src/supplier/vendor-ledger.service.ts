import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAuditService } from '../common/services/system-audit.service';

/**
 * Procurement/Inventory/Finance Integration, Phase 5. Per the spec: "Vendor
 * Ledger is fully derived/calculated from Procurement + Payment + Receiving
 * + Adjustments... never manually maintained as a separate balance; tracks
 * outstanding payable AND outstanding goods... separately." Nothing here
 * is stored -- every figure is computed fresh from Purchase, PurchasePayment,
 * GoodsReceipt/GoodsReceiptLine, and VendorLedgerAdjustment on every read.
 */
@Injectable()
export class VendorLedgerService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly systemAuditService: SystemAuditService,
    ) { }

    /**
     * Outstanding payable: what Hairlux owes this vendor.
     * sum(grandTotal) - sum(amountPaid) across non-cancelled purchases,
     * plus DEBIT adjustments, minus CREDIT adjustments.
     */
    private async computePayable(vendorId: string): Promise<number> {
        const [purchaseAgg, debitAgg, creditAgg] = await Promise.all([
            this.prisma.purchase.aggregate({
                where: { vendorId, status: { not: 'CANCELLED' } },
                _sum: { grandTotal: true, amountPaid: true },
            }),
            this.prisma.vendorLedgerAdjustment.aggregate({
                where: { vendorId, type: 'DEBIT' },
                _sum: { amount: true },
            }),
            this.prisma.vendorLedgerAdjustment.aggregate({
                where: { vendorId, type: 'CREDIT' },
                _sum: { amount: true },
            }),
        ]);
        const grandTotal = Number(purchaseAgg._sum.grandTotal ?? 0);
        const amountPaid = Number(purchaseAgg._sum.amountPaid ?? 0);
        const debits = Number(debitAgg._sum.amount ?? 0);
        const credits = Number(creditAgg._sum.amount ?? 0);
        return grandTotal - amountPaid + debits - credits;
    }

    /**
     * Outstanding goods: what the vendor still owes Hairlux (ordered and
     * paid for, not yet delivered), valued at each line's own unit price.
     * Per-line: quantity - sum(acceptedQty across every GoodsReceiptLine
     * against it). Cancelled purchases excluded -- nothing is "owed" on an
     * order that was called off.
     */
    private async computeOutstandingGoods(vendorId: string): Promise<{ value: number; lines: any[] }> {
        const purchases = await this.prisma.purchase.findMany({
            where: { vendorId, status: { not: 'CANCELLED' } },
            include: {
                lines: {
                    include: {
                        product: { select: { id: true, name: true, sku: true } },
                        goodsReceiptLines: { select: { acceptedQty: true } },
                    },
                },
            },
        });

        const lines: any[] = [];
        let value = 0;
        for (const purchase of purchases) {
            for (const line of purchase.lines) {
                const received = line.goodsReceiptLines.reduce((sum: number, r: { acceptedQty: number }) => sum + r.acceptedQty, 0);
                const outstandingQty = line.quantity - received;
                if (outstandingQty > 0) {
                    const unitPrice = Number(line.unitPrice);
                    value += outstandingQty * unitPrice;
                    lines.push({
                        purchaseId: purchase.id,
                        purchaseNumber: purchase.purchaseNumber,
                        productId: line.product.id,
                        productName: line.product.name,
                        sku: line.product.sku,
                        orderedQty: line.quantity,
                        receivedQty: received,
                        outstandingQty,
                        unitPrice,
                        outstandingValue: outstandingQty * unitPrice,
                    });
                }
            }
        }
        return { value, lines };
    }

    /**
     * Chronological, merged view of everything that moved this vendor's
     * balance -- spec: "full movement history retained, every movement
     * traces back to a Source Transaction." Purchases and adjustments
     * increase/decrease the payable; payments reduce it.
     */
    private async getLedgerEntries(vendorId: string) {
        const [purchases, payments, adjustments] = await Promise.all([
            this.prisma.purchase.findMany({
                where: { vendorId, status: { not: 'CANCELLED' } },
                select: { id: true, purchaseNumber: true, purchaseDate: true, grandTotal: true },
            }),
            this.prisma.purchasePayment.findMany({
                where: { purchase: { vendorId } },
                select: { id: true, purchaseId: true, amount: true, paymentDate: true, paymentReference: true, purchase: { select: { purchaseNumber: true } } },
            }),
            this.prisma.vendorLedgerAdjustment.findMany({
                where: { vendorId },
                select: { id: true, type: true, amount: true, reason: true, createdAt: true, referencePurchaseId: true },
            }),
        ]);

        const entries = [
            ...purchases.map((p: any) => ({
                type: 'PURCHASE' as const,
                date: p.purchaseDate,
                reference: `Purchase #${p.purchaseNumber}`,
                amount: Number(p.grandTotal),
                direction: 'INCREASES_PAYABLE' as const,
                sourceId: p.id,
            })),
            ...payments.map((pay: any) => ({
                type: 'PAYMENT' as const,
                date: pay.paymentDate,
                reference: pay.paymentReference ?? `Payment on Purchase #${pay.purchase.purchaseNumber}`,
                amount: Number(pay.amount),
                direction: 'DECREASES_PAYABLE' as const,
                sourceId: pay.id,
            })),
            ...adjustments.map((adj: any) => ({
                type: 'ADJUSTMENT' as const,
                date: adj.createdAt,
                reference: adj.reason,
                amount: Number(adj.amount),
                direction: adj.type === 'DEBIT' ? ('INCREASES_PAYABLE' as const) : ('DECREASES_PAYABLE' as const),
                sourceId: adj.id,
                referencePurchaseId: adj.referencePurchaseId,
            })),
        ];

        entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return entries;
    }

    async getVendorLedger(vendorId: string) {
        const vendor = await this.prisma.supplier.findUnique({ where: { id: vendorId } });
        if (!vendor) throw new NotFoundException('Vendor not found');

        const [payable, outstandingGoods, entries] = await Promise.all([
            this.computePayable(vendorId),
            this.computeOutstandingGoods(vendorId),
            this.getLedgerEntries(vendorId),
        ]);

        return {
            vendor: { id: vendor.id, name: vendor.name, type: vendor.type },
            outstandingPayable: payable,
            outstandingGoodsValue: outstandingGoods.value,
            outstandingGoodsLines: outstandingGoods.lines,
            entries,
        };
    }

    /** Summary across every vendor, for a list/overview screen. */
    async listVendorBalances() {
        const vendors = await this.prisma.supplier.findMany({
            where: { isActive: true },
            select: { id: true, name: true, type: true },
        });

        const balances = await Promise.all(
            vendors.map(async (v: { id: string; name: string; type: string }) => ({
                vendor: v,
                outstandingPayable: await this.computePayable(v.id),
                outstandingGoodsValue: (await this.computeOutstandingGoods(v.id)).value,
            })),
        );

        return balances.filter((b: { outstandingPayable: number; outstandingGoodsValue: number }) => b.outstandingPayable !== 0 || b.outstandingGoodsValue !== 0);
    }

    async createAdjustment(
        vendorId: string,
        dto: { type: 'CREDIT' | 'DEBIT'; amount: number; reason: string; referencePurchaseId?: string },
        actorId: string | undefined,
    ) {
        const vendor = await this.prisma.supplier.findUnique({ where: { id: vendorId } });
        if (!vendor) throw new NotFoundException('Vendor not found');

        const adjustment = await this.prisma.vendorLedgerAdjustment.create({
            data: {
                vendorId,
                type: dto.type,
                amount: dto.amount,
                reason: dto.reason,
                referencePurchaseId: dto.referencePurchaseId,
                createdById: actorId,
            },
        });

        await this.systemAuditService.log({
            action: 'VENDOR_LEDGER_ADJUSTMENT_CREATED',
            entityType: 'VendorLedgerAdjustment',
            entityId: adjustment.id,
            actorId,
            note: dto.reason,
            after: { vendorId, type: dto.type, amount: dto.amount },
        });

        return adjustment;
    }
}