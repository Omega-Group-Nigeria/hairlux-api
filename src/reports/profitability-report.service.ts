import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ProfitabilityFilters {
    branchId?: string;
    from?: Date;
    to?: Date;
}

interface Totals {
    revenue: number;
    cogs: number;
    grossProfit: number;
}

function addLine(totals: Totals, unitPrice: number | null, unitCost: number | null, quantity: number, unknownCost: { count: number }) {
    if (unitPrice == null) return; // not a billed line -- no revenue to count
    const lineRevenue = unitPrice * quantity;
    totals.revenue += lineRevenue;
    if (unitCost != null) {
        totals.cogs += unitCost * quantity;
    } else {
        unknownCost.count += 1;
    }
}

function marginPercent(t: Totals) {
    return t.revenue > 0 ? Math.round(((t.revenue - t.cogs) / t.revenue) * 10000) / 100 : 0;
}

@Injectable()
export class ProfitabilityReportService {
    constructor(private readonly prisma: PrismaService) { }

    async getProfitability(filters: ProfitabilityFilters) {
        const [standaloneLines, bookingLines] = await Promise.all([
            this.prisma.productSaleItem.findMany({
                where: {
                    sale: {
                        ...(filters.branchId && { branchId: filters.branchId }),
                        ...((filters.from || filters.to) && {
                            createdAt: {
                                ...(filters.from && { gte: filters.from }),
                                ...(filters.to && { lte: filters.to }),
                            },
                        }),
                    },
                },
                select: { quantity: true, unitPrice: true, unitCost: true, item: { select: { name: true } } },
            }),
            this.prisma.salonBookingInventoryItem.findMany({
                where: {
                    unitPrice: { not: null }, // CONSUMED-only lines (no unitPrice) were never billed -- not a sale
                    booking: {
                        status: 'COMPLETED',
                        ...(filters.branchId && { branchId: filters.branchId }),
                        ...((filters.from || filters.to) && {
                            completedAt: {
                                ...(filters.from && { gte: filters.from }),
                                ...(filters.to && { lte: filters.to }),
                            },
                        }),
                    },
                },
                select: { quantity: true, unitPrice: true, unitCost: true, item: { select: { name: true } } },
            }),
        ]);

        const standaloneTotals: Totals = { revenue: 0, cogs: 0, grossProfit: 0 };
        const bookingTotals: Totals = { revenue: 0, cogs: 0, grossProfit: 0 };
        const unknownCost = { count: 0 };
        const byProduct = new Map<string, Totals & { quantitySold: number }>();

        const allLines = [
            ...standaloneLines.map((l: any) => ({ ...l, _bucket: standaloneTotals })),
            ...bookingLines.map((l: any) => ({ ...l, _bucket: bookingTotals })),
        ];

        for (const line of allLines) {
            const unitPrice = line.unitPrice != null ? Number(line.unitPrice) : null;
            const unitCost = line.unitCost != null ? Number(line.unitCost) : null;
            addLine(line._bucket, unitPrice, unitCost, line.quantity, unknownCost);

            if (unitPrice == null) continue;
            const productName = line.item?.name ?? 'Unknown product';
            const existing = byProduct.get(productName) ?? { revenue: 0, cogs: 0, grossProfit: 0, quantitySold: 0 };
            existing.revenue += unitPrice * line.quantity;
            if (unitCost != null) existing.cogs += unitCost * line.quantity;
            existing.quantitySold += line.quantity;
            byProduct.set(productName, existing);
        }

        standaloneTotals.grossProfit = standaloneTotals.revenue - standaloneTotals.cogs;
        bookingTotals.grossProfit = bookingTotals.revenue - bookingTotals.cogs;
        const combined: Totals = {
            revenue: standaloneTotals.revenue + bookingTotals.revenue,
            cogs: standaloneTotals.cogs + bookingTotals.cogs,
            grossProfit: standaloneTotals.grossProfit + bookingTotals.grossProfit,
        };

        // Full list, sorted by revenue -- not pre-truncated. The API
        // returning "top 10" only would silently cap what "Export CSV"
        // on the frontend could ever produce; the frontend decides how
        // much to show on screen (typically the first 10) versus what
        // export uses (all of it).
        const products = Array.from(byProduct.entries())
            .map(([productName, t]) => ({
                productName,
                revenue: t.revenue,
                cogs: t.cogs,
                grossProfit: t.revenue - t.cogs,
                grossMarginPercent: marginPercent(t),
                quantitySold: t.quantitySold,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        return {
            revenue: combined.revenue,
            cogs: combined.cogs,
            grossProfit: combined.grossProfit,
            grossMarginPercent: marginPercent(combined),
            linesWithUnknownCost: unknownCost.count,
            bySource: {
                standaloneSales: { ...standaloneTotals, grossMarginPercent: marginPercent(standaloneTotals) },
                bookingSales: { ...bookingTotals, grossMarginPercent: marginPercent(bookingTotals) },
            },
            products,
        };
    }
}