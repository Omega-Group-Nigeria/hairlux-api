import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Address } from '@prisma/client';
import { resolveAddressFields } from '../../common/utils/address.utils';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDeliveryRegionDto } from '../dto/create-delivery-region.dto';
import { UpdateDeliveryRegionDto } from '../dto/update-delivery-region.dto';

@Injectable()
export class DeliveryPricingService {
  constructor(private prisma: PrismaService) {}

  private toRegionResponse(region: {
    id: string;
    name: string;
    state: string;
    deliveryFee: { toNumber: () => number } | number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: region.id,
      name: region.name,
      state: region.state,
      deliveryFee: Number(region.deliveryFee),
      isActive: region.isActive,
      createdAt: region.createdAt,
      updatedAt: region.updatedAt,
    };
  }

  private async assertStateAvailable(state: string, excludeId?: string) {
    const existing = await this.prisma.deliveryRegion.findFirst({
      where: {
        state: { equals: state, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (existing) {
      throw new ConflictException(
        `A delivery region for "${state}" already exists`,
      );
    }
  }

  async resolveDeliveryFeeForAddress(address: Address) {
    const { state: resolvedState } = resolveAddressFields(address);
    const state = resolvedState?.trim();

    if (!state) {
      throw new BadRequestException(
        'Delivery address must include a state. Please update your address or contact support.',
      );
    }

    const region = await this.prisma.deliveryRegion.findFirst({
      where: {
        state: { equals: state, mode: 'insensitive' },
        isActive: true,
      },
    });

    if (!region) {
      throw new BadRequestException(
        `Delivery is not available for "${state}" yet. Please contact support.`,
      );
    }

    return {
      deliveryFee: Number(region.deliveryFee),
      deliveryRegion: {
        name: region.name,
        state: region.state,
      },
    };
  }

  async findAllRegions() {
    const regions = await this.prisma.deliveryRegion.findMany({
      orderBy: { name: 'asc' },
    });

    return regions.map((region) => this.toRegionResponse(region));
  }

  async createRegion(dto: CreateDeliveryRegionDto) {
    const state = dto.state.trim();
    await this.assertStateAvailable(state);

    const region = await this.prisma.deliveryRegion.create({
      data: {
        name: dto.name.trim(),
        state,
        deliveryFee: dto.deliveryFee,
        isActive: dto.isActive ?? true,
      },
    });

    return this.toRegionResponse(region);
  }

  async updateRegion(id: string, dto: UpdateDeliveryRegionDto) {
    const existing = await this.prisma.deliveryRegion.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Delivery region not found');
    }

    if (dto.state) {
      await this.assertStateAvailable(dto.state.trim(), id);
    }

    const region = await this.prisma.deliveryRegion.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.toRegionResponse(region);
  }

  async removeRegion(id: string) {
    const existing = await this.prisma.deliveryRegion.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Delivery region not found');
    }

    await this.prisma.deliveryRegion.delete({ where: { id } });
  }
}