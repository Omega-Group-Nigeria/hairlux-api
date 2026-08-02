import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SupplierService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: CreateSupplierDto) {
        return this.prisma.supplier.create({ data: dto });
    }

    async findAll(type?: 'SUPPLIER' | 'VENDOR', activeOnly?: boolean) {
        return this.prisma.supplier.findMany({
            where: {
                ...(type && { type }),
                ...(activeOnly && { isActive: true }),
            },
            orderBy: { name: 'asc' },
        });
    }

    async findOne(id: string) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id },
            include: {
                inventoryItems: {
                    select: { id: true, name: true, category: true, currentQuantity: true, branch: { select: { id: true, name: true } } },
                },
            },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        return supplier;
    }

    async update(id: string, dto: UpdateSupplierDto) {
        const existing = await this.prisma.supplier.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Supplier not found');
        return this.prisma.supplier.update({ where: { id }, data: dto });
    }

    async remove(id: string) {
        const existing = await this.prisma.supplier.findUnique({
            where: { id },
            include: { _count: { select: { inventoryItems: true } } },
        });
        if (!existing) throw new NotFoundException('Supplier not found');
        if (existing._count.inventoryItems > 0) {
            throw new BadRequestException(
                `Cannot delete — ${existing._count.inventoryItems} inventory item(s) are still linked to this ${existing.type === 'VENDOR' ? 'vendor' : 'supplier'}. Reassign or unlink them first, or deactivate instead of deleting.`,
            );
        }
        await this.prisma.supplier.delete({ where: { id } });
        return { deleted: true, id };
    }
}