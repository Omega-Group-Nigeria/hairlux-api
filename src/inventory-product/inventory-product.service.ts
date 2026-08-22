import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertInventoryProductDto } from './dto/upsert-inventory-product.dto';

@Injectable()
export class InventoryProductService {
    constructor(private readonly prisma: PrismaService) { }

    async findAll(filters: { search?: string; category?: string; activeOnly?: boolean }) {
        return this.prisma.inventoryProduct.findMany({
            where: {
                ...(filters.search && {
                    OR: [
                        { name: { contains: filters.search, mode: 'insensitive' } },
                        { sku: { contains: filters.search, mode: 'insensitive' } },
                        { brand: { contains: filters.search, mode: 'insensitive' } },
                    ],
                }),
                ...(filters.category && { category: filters.category as any }),
                ...(filters.activeOnly && { isActive: true }),
            },
            include: {
                suppliers: { include: { vendor: { select: { id: true, name: true, type: true } } } },
                _count: { select: { inventoryItems: true } },
            },
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: string) {
        const product = await this.prisma.inventoryProduct.findUnique({
            where: { id },
            include: {
                suppliers: { include: { vendor: { select: { id: true, name: true, type: true } } } },
                // Branch-by-branch stock breakdown -- populated once Phase 2
                // links InventoryItem rows to this product; empty for every
                // product until that migration runs, by design.
                inventoryItems: {
                    select: { id: true, storeStock: true, salesStock: true, usageStock: true, branch: { select: { id: true, name: true } } },
                },
            },
        });
        if (!product) throw new NotFoundException('Product not found');
        return product;
    }

    async create(dto: UpsertInventoryProductDto) {
        if (dto.sku) {
            const existing = await this.prisma.inventoryProduct.findUnique({ where: { sku: dto.sku } });
            if (existing) throw new BadRequestException(`SKU "${dto.sku}" is already in use by another product.`);
        }

        const { vendorIds, ...productData } = dto;
        return this.prisma.inventoryProduct.create({
            data: {
                ...productData,
                suppliers: vendorIds?.length ? { create: vendorIds.map((vendorId) => ({ vendorId })) } : undefined,
            },
            include: { suppliers: { include: { vendor: { select: { id: true, name: true } } } } },
        });
    }

    async update(id: string, dto: UpsertInventoryProductDto) {
        const existing = await this.prisma.inventoryProduct.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Product not found');

        if (dto.sku && dto.sku !== existing.sku) {
            const skuTaken = await this.prisma.inventoryProduct.findUnique({ where: { sku: dto.sku } });
            if (skuTaken) throw new BadRequestException(`SKU "${dto.sku}" is already in use by another product.`);
        }

        const { vendorIds, ...productData } = dto;
        return this.prisma.inventoryProduct.update({
            where: { id },
            data: {
                ...productData,
                // Only touches vendor links when the caller actually sent
                // vendorIds -- an update that omits the field entirely
                // leaves existing supplier links untouched, rather than
                // silently wiping them.
                ...(vendorIds !== undefined && {
                    suppliers: { deleteMany: {}, create: vendorIds.map((vendorId) => ({ vendorId })) },
                }),
            },
            include: { suppliers: { include: { vendor: { select: { id: true, name: true } } } } },
        });
    }

    async remove(id: string) {
        const existing = await this.prisma.inventoryProduct.findUnique({
            where: { id },
            include: { _count: { select: { inventoryItems: true } } },
        });
        if (!existing) throw new NotFoundException('Product not found');
        if (existing._count.inventoryItems > 0) {
            throw new BadRequestException(
                `Cannot delete — ${existing._count.inventoryItems} branch inventory item(s) are still linked to this product. Deactivate instead of deleting.`,
            );
        }
        await this.prisma.inventoryProduct.delete({ where: { id } });
        return { deleted: true, id };
    }
}