import { Injectable } from '@nestjs/common';
import { FinancialTransactionCategory, FinancialTransactionDirection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordFinancialTransactionParams {
    direction: FinancialTransactionDirection;
    category: FinancialTransactionCategory;
    amount: number;
    branchId?: string;
    description?: string;
    paymentMethod?: string;
    recordedById?: string;
    /** Polymorphic source reference, e.g. { sourceType: 'ProductSale', sourceId: sale.id } — same "Source Transaction" pattern StockMovement already uses. */
    sourceType?: string;
    sourceId?: string;
}

export interface FinancialQueryFilters {
    direction?: FinancialTransactionDirection;
    category?: FinancialTransactionCategory;
    branchId?: string;
    from?: Date;
    to?: Date;
}

/** FIN-2026-000125 — matches SalonBooking.bookingNumber's own HLB-000123 convention exactly. */
function formatReference(sequenceNumber: number, createdAt: Date): string {
    return `FIN-${createdAt.getFullYear()}-${String(sequenceNumber).padStart(6, '0')}`;
}

@Injectable()
export class FinancialTransactionService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * The one method every other module calls to record a money movement.
     * Never construct a FinancialTransaction row directly elsewhere --
     * this is the single point that assigns the human-readable reference
     * and keeps the shape consistent regardless of caller.
     *
     * Accepts an optional transaction client so a caller that needs the
     * financial record to be atomic with its own source record (e.g. a
     * sale and its ledger entry either both commit or neither does) can
     * pass its own `tx` from inside its own $transaction callback --
     * exactly the same reasoning that kept InventoryService's
     * deductForSale from being called from within ProductSaleService's
     * transaction earlier in this rebuild, resolved properly here instead
     * of worked around.
     */
    async record(params: RecordFinancialTransactionParams, tx?: Prisma.TransactionClient) {
        const client = tx ?? this.prisma;

        const created = await client.financialTransaction.create({
            data: {
                reference: '', // placeholder, overwritten immediately below
                direction: params.direction,
                category: params.category,
                amount: params.amount,
                branchId: params.branchId,
                description: params.description,
                paymentMethod: params.paymentMethod,
                recordedById: params.recordedById,
                sourceType: params.sourceType,
                sourceId: params.sourceId,
            },
        });

        return client.financialTransaction.update({
            where: { id: created.id },
            data: { reference: formatReference(created.sequenceNumber, created.createdAt) },
        });
    }

    async findAll(filters: FinancialQueryFilters, page = 1, limit = 50) {
        const where = {
            ...(filters.direction && { direction: filters.direction }),
            ...(filters.category && { category: filters.category }),
            ...(filters.branchId && { branchId: filters.branchId }),
            ...((filters.from || filters.to) && {
                createdAt: {
                    ...(filters.from && { gte: filters.from }),
                    ...(filters.to && { lte: filters.to }),
                },
            }),
        };

        const [items, total] = await Promise.all([
            this.prisma.financialTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    branch: { select: { id: true, name: true } },
                    recordedBy: { select: { id: true, firstName: true, lastName: true } },
                },
            }),
            this.prisma.financialTransaction.count({ where }),
        ]);

        return { items, total, page, limit };
    }

    /**
     * The dashboard's own numbers -- deliberately computed by summing this
     * ledger directly, never recreated/estimated per-module, per the
     * spec's explicit "reads from the central engine" requirement.
     */
    async getSummary(filters: FinancialQueryFilters) {
        const where = {
            ...(filters.branchId && { branchId: filters.branchId }),
            ...((filters.from || filters.to) && {
                createdAt: {
                    ...(filters.from && { gte: filters.from }),
                    ...(filters.to && { lte: filters.to }),
                },
            }),
        };

        const [inflowAgg, outflowAgg, byCategory] = await Promise.all([
            this.prisma.financialTransaction.aggregate({ where: { ...where, direction: 'INFLOW' }, _sum: { amount: true } }),
            this.prisma.financialTransaction.aggregate({ where: { ...where, direction: 'OUTFLOW' }, _sum: { amount: true } }),
            this.prisma.financialTransaction.groupBy({
                by: ['category', 'direction'],
                where,
                _sum: { amount: true },
            }),
        ]);

        const totalInflow = Number(inflowAgg._sum.amount ?? 0);
        const totalOutflow = Number(outflowAgg._sum.amount ?? 0);

        return {
            totalInflow,
            totalOutflow,
            netCashFlow: totalInflow - totalOutflow,
            byCategory: byCategory.map((row) => ({
                category: row.category,
                direction: row.direction,
                total: Number(row._sum.amount ?? 0),
            })),
        };
    }
}