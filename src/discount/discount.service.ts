import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { QueryDiscountsDto } from './dto/query-discounts.dto';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async create(dto: CreateDiscountDto) {
    const existing = await this.prisma.discountCode.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Discount code "${dto.code}" already exists`);
    }

    const discount = await this.prisma.discountCode.create({
      data: {
        code: dto.code,
        name: dto.name,
        percentage: dto.percentage,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxUses: dto.maxUses ?? null,
      },
    });

    this.logger.log(
      `Discount code created: ${discount.code} (${discount.percentage}%)`,
    );
    return discount;
  }

  async findAll(query: QueryDiscountsDto) {
    const { page = 1, limit = 20, isActive, search } = query;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [codes, total] = await Promise.all([
      this.prisma.discountCode.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.discountCode.count({ where }),
    ]);

    return {
      discounts: codes,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { id },
    });
    if (!discount) throw new NotFoundException('Discount code not found');
    return discount;
  }

  async update(id: string, dto: UpdateDiscountDto) {
    await this.findOne(id); // ensures it exists

    const discount = await this.prisma.discountCode.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.percentage !== undefined && { percentage: dto.percentage }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.startsAt !== undefined && {
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
        ...(dto.maxUses !== undefined && { maxUses: dto.maxUses }),
      },
    });

    this.logger.log(`Discount code updated: ${discount.code}`);
    return discount;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.discountCode.delete({ where: { id } });
    this.logger.log(`Discount code deleted: ${id}`);
  }

  // ─── Public (authenticated) ───────────────────────────────────────────────────

  async validate(code: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!discount) {
      throw new NotFoundException('Discount code not found');
    }

    if (!discount.isActive) {
      throw new BadRequestException('This discount code is no longer active');
    }

    if (discount.startsAt && discount.startsAt > new Date()) {
      throw new BadRequestException('This discount code is not yet active');
    }

    if (discount.expiresAt && discount.expiresAt < new Date()) {
      throw new BadRequestException('This discount code has expired');
    }

    if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
      throw new BadRequestException(
        'This discount code has reached its usage limit',
      );
    }

    return {
      id: discount.id,
      code: discount.code,
      name: discount.name,
      percentage: discount.percentage,
    };
  }

  // Called internally when a booking with a code is confirmed
  async incrementUsage(code: string) {
    await this.prisma.discountCode.update({
      where: { code },
      data: { usedCount: { increment: 1 } },
    });
  }
}
