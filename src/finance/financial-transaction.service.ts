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
    /**
     * A Staff id -- every existing caller already has one of these on
     * hand (it's the primary identity concept throughout this admin/
     * staff-facing codebase), not a User id. recordedById's own FK
     * points at User though, so record() resolves Staff -> User
     * internally (see its own comment) rather than requiring every
     * caller to separately track and pass a User id too.
     */
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
     *
     * Bug fix: every one of this method's three existing callers (salon
     * booking completion, product sale, purchase payment) passed a Staff
     * id straight through as recordedById, which crashed with a foreign
     * key violation the first time any of them actually ran --
     * recordedById's own FK points at User, not Staff (confirmed by
     * findAll/export's own recordedBy include already selecting
     * firstName/lastName, User's fields, not Staff's name). Rather than
     * fix each of the three callers individually (and risk a fourth
     * future caller repeating the same mistake), resolved once here:
     * params.recordedById is treated as a Staff id and looked up to its
     * linked userId before being written.
     */
    async record(params: RecordFinancialTransactionParams, tx?: Prisma.TransactionClient) {
        const client = tx ?? this.prisma;

        let recordedByUserId: string | undefined;
        if (params.recordedById) {
            const staff = await client.staff.findUnique({ where: { id: params.recordedById }, select: { userId: true } });
            recordedByUserId = staff?.userId ?? undefined;
        }

        const created = await client.financialTransaction.create({
            data: {
                reference: '', // placeholder, overwritten immediately below
                direction: params.direction,
                category: params.category,
                amount: params.amount,
                branchId: params.branchId,
                description: params.description,
                paymentMethod: params.paymentMethod,
                recordedById: recordedByUserId,
                sourceType: params.sourceType,
                sourceId: params.sourceId,
            },
        });

        return client.financialTransaction.update({
            where: { id: created.id },
            data: { reference: formatReference(created.sequenceNumber, created.createdAt) },
        });
    }

    private buildListWhere(filters: FinancialQueryFilters) {
        return {
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
    }

    async findAll(filters: FinancialQueryFilters, page = 1, limit = 50) {
        const where = this.buildListWhere(filters);

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
     * Phase 8: same filters and ordering as findAll, but every matching
     * row rather than one page -- what an "export the current view"
     * action on a paginated list actually needs. Capped rather than truly
     * unbounded: a request with no date range at all, run for years,
     * could otherwise pull the entire table into memory at once.
     */
    async export(filters: FinancialQueryFilters) {
        const EXPORT_ROW_CAP = 10000;
        return this.prisma.financialTransaction.findMany({
            where: this.buildListWhere(filters),
            orderBy: { createdAt: 'desc' },
            take: EXPORT_ROW_CAP,
            include: {
                branch: { select: { id: true, name: true } },
                recordedBy: { select: { id: true, firstName: true, lastName: true } },
            },
        });
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