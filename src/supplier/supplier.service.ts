import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const BANKING_FIELDS = ['bankName', 'accountNumber', 'verifiedAccountName'] as const;

@Injectable()
export class SupplierService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Strips banking fields from the response object entirely (not just
     * masking with '***') when the caller lacks suppliers:view_banking --
     * per the spec's explicit requirement that this stay restricted to
     * authorized users. Applied at the service layer so it's enforced
     * regardless of which controller/consumer calls this.
     */
    private stripBankingIfUnauthorized<T extends Record<string, any>>(record: T, canViewBanking: boolean): T {
        if (canViewBanking) return record;
        const result = { ...record };
        for (const field of BANKING_FIELDS) delete (result as any)[field];
        return result;
    }

    async create(dto: CreateSupplierDto) {
        return this.prisma.supplier.create({ data: dto });
    }

    async findAll(type?: 'SUPPLIER' | 'VENDOR', activeOnly?: boolean, canViewBanking = false) {
        const suppliers = await this.prisma.supplier.findMany({
            where: {
                ...(type && { type }),
                ...(activeOnly && { isActive: true }),
            },
            orderBy: { name: 'asc' },
        });
        return suppliers.map((s) => this.stripBankingIfUnauthorized(s, canViewBanking));
    }

    async findOne(id: string, canViewBanking = false) {
        const supplier = await this.prisma.supplier.findUnique({
            where: { id },
            include: {
                inventoryItems: {
                    select: { id: true, name: true, category: true, storeStock: true, salesStock: true, usageStock: true, branch: { select: { id: true, name: true } } },
                },
            },
        });
        if (!supplier) throw new NotFoundException('Supplier not found');
        return this.stripBankingIfUnauthorized(supplier, canViewBanking);
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