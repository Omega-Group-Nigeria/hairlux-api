import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinancialTransactionService } from '../finance/financial-transaction.service';
import { CreateProductSaleDto } from './dto/create-product-sale.dto';
@Injectable()
export class ProductSaleService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly inventoryService: InventoryService,
        private readonly financialTransactionService: FinancialTransactionService,
    ) { }

    /**
     * A standalone retail sale — no service attached, distinct from
     * SalonBooking's "products used/sold" lines which always ride on a
     * service appointment. Validates every line is FOR_SALE, priced, and
     * in stock at this branch before touching anything; deducts stock and
     * records a StockMovement (type SOLD) per line inside one transaction.
     */
    async create(dto: CreateProductSaleDto, branchId: string, soldById: string | undefined) {
        const itemIds = dto.items.map((line) => line.itemId);
        const items = await this.prisma.inventoryItem.findMany({
            where: { id: { in: itemIds }, branchId },
            // Phase 8: resolved here, once, so cost can be snapshotted onto
            // each ProductSaleItem below without a query per line.
            include: { product: { select: { costPrice: true } } },
        });
        if (items.length !== new Set(itemIds).size) {
            throw new NotFoundException('One or more items were not found at this branch');
        }

        for (const line of dto.items) {
            const item = items.find((i) => i.id === line.itemId)!;
            if (item.category !== 'FOR_SALE') {
                throw new BadRequestException(`${item.name} is not marked as available for sale`);
            }
            if (item.price == null) {
                throw new BadRequestException(`${item.name} has no price set — set one on the item before selling it`);
            }
            if (item.salesStock < line.quantity) {
                throw new BadRequestException(`Not enough sales stock for ${item.name} — ${item.salesStock} available, ${line.quantity} requested`);
            }
        }

        const totalAmount = dto.items.reduce((sum, line) => {
            const item = items.find((i) => i.id === line.itemId)!;
            return sum + Number(item.price) * line.quantity;
        }, 0);

        const sale = await this.prisma.$transaction(async (tx) => {
            const created = await tx.productSale.create({
                data: {
                    branchId,
                    soldById,
                    customerName: dto.customerName,
                    customerPhone: dto.customerPhone,
                    totalAmount,
                    items: {
                        create: dto.items.map((line) => {
                            const item = items.find((i) => i.id === line.itemId)!;
                            return {
                                itemId: line.itemId,
                                quantity: line.quantity,
                                unitPrice: item.price!,
                                unitCost: (item as any).product?.costPrice ?? null,
                            };
                        }),
                    },
                },
                include: { items: { include: { item: { select: { id: true, name: true } } } } },
            });

            for (const line of dto.items) {
                await tx.inventoryItem.update({
                    where: { id: line.itemId },
                    // A standalone retail sale deducts from Sales Stock --
                    // the bucket meant for selling to customers, per the
                    // spec's Store/Sales/Usage split.
                    data: { salesStock: { decrement: line.quantity } },
                });
                await tx.stockMovement.create({
                    data: {
                        itemId: line.itemId,
                        type: 'SOLD',
                        stockType: 'SALES',
                        quantityDelta: -line.quantity,
                        referenceId: created.id,
                        performedById: soldById,
                    },
                });
            }

            // Recorded inside this same transaction -- the sale and its
            // ledger entry either both commit or neither does.
            await this.financialTransactionService.record(
                {
                    direction: 'INFLOW',
                    category: 'PRODUCT_SALE',
                    amount: totalAmount,
                    branchId,
                    description: `Product sale${dto.customerName ? ` — ${dto.customerName}` : ''}`,
                    recordedById: soldById,
                    sourceType: 'ProductSale',
                    sourceId: created.id,
                },
                tx,
            );

            return created;
        });

        // Outside the transaction — same pattern SalonBookingService uses after
        // deducting stock, so a fresh low-stock alert fires if this sale tips
        // an item under its threshold.
        for (const line of dto.items) {
            await this.inventoryService.checkAndTriggerLowStockAlert(line.itemId);
        }

        return sale;
    }

    async findAll(branchId?: string, from?: Date, to?: Date) {
        return this.prisma.productSale.findMany({
            where: {
                ...(branchId && { branchId }),
                ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
            },
            include: {
                items: { include: { item: { select: { id: true, name: true } } } },
                soldBy: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const sale = await this.prisma.productSale.findUnique({
            where: { id },
            include: {
                items: { include: { item: { select: { id: true, name: true } } } },
                soldBy: { select: { id: true, name: true } },
                branch: { select: { id: true, name: true } },
            },
        });
        if (!sale) throw new NotFoundException('Sale not found');
        return sale;
    }
}