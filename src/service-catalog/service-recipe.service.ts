import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServiceRecipeService {
    constructor(private readonly prisma: PrismaService) { }

    async getRecipe(serviceId: string) {
        const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new NotFoundException('Service not found');

        return this.prisma.serviceProductConsumption.findMany({
            where: { serviceId },
            include: { product: { select: { id: true, name: true, sku: true, category: true } } },
            orderBy: { id: 'asc' },
        });
    }

    /**
     * Full replace, matching the same "send the whole list" convention
     * already used elsewhere in this codebase for step/line-style child
     * records (e.g. LifecycleCampaignSequence steps) -- simpler and less
     * error-prone for the admin UI than diffing individual add/remove
     * calls, and a recipe is small enough (a handful of products) that
     * this is never a meaningful cost.
     */
    async setRecipe(serviceId: string, lines: { productId: string; quantity: number }[]) {
        const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
        if (!service) throw new NotFoundException('Service not found');

        const productIds = lines.map((l) => l.productId);
        if (new Set(productIds).size !== productIds.length) {
            throw new BadRequestException('Each product can only appear once in a service\'s recipe');
        }
        if (productIds.length) {
            const found = await this.prisma.inventoryProduct.count({ where: { id: { in: productIds } } });
            if (found !== productIds.length) {
                throw new BadRequestException('One or more products in the recipe do not exist');
            }
        }
        if (lines.some((l) => l.quantity < 1)) {
            throw new BadRequestException('Recipe quantities must be at least 1');
        }

        await this.prisma.$transaction(async (tx: any) => {
            await tx.serviceProductConsumption.deleteMany({ where: { serviceId } });
            if (lines.length) {
                await tx.serviceProductConsumption.createMany({
                    data: lines.map((l) => ({ serviceId, productId: l.productId, quantity: l.quantity })),
                });
            }
        });

        return this.getRecipe(serviceId);
    }
}