import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  DiscountType,
  InfluencerRewardSettings,
  ReferralRewardType,
  ReferralStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { QueryDiscountsDto } from './dto/query-discounts.dto';
import { CreateInfluencerDiscountDto } from './dto/create-influencer-discount.dto';
import { UpdateInfluencerRewardSettingsDto } from './dto/update-influencer-reward-settings.dto';
import { QueryInfluencerDiscountsDto } from './dto/query-influencer-discounts.dto';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

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

  // ─── Influencer Discount CRUD (Admin) ─────────────────────────────────────

  async createInfluencerDiscount(dto: CreateInfluencerDiscountDto) {
    // Resolve influencer ID from either field
    const resolvedInfluencerId = dto.influencerId ?? dto.influencerUserId;
    if (!resolvedInfluencerId) {
      throw new BadRequestException(
        'Either influencerId or influencerUserId must be provided',
      );
    }

    // Validate influencer exists
    const influencer = await this.prisma.influencer.findUnique({
      where: { id: resolvedInfluencerId },
    });
    if (!influencer) {
      throw new NotFoundException(
        `Influencer with id "${resolvedInfluencerId}" not found`,
      );
    }

    // Case-insensitive uniqueness check
    const normalizedCode = dto.code.trim().toUpperCase();
    const existing = await this.prisma.discountCode.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new ConflictException(
        `Discount code "${normalizedCode}" already exists`,
      );
    }

    // Date validation
    if (
      dto.startsAt &&
      dto.expiresAt &&
      new Date(dto.startsAt) >= new Date(dto.expiresAt)
    ) {
      throw new BadRequestException('startsAt must be before expiresAt');
    }

    const discount = await this.prisma.discountCode.create({
      data: {
        code: normalizedCode,
        name: dto.name ?? `${influencer.name} ${dto.percentage}% Off`,
        percentage: dto.percentage,
        type: DiscountType.INFLUENCER,
        influencerId: resolvedInfluencerId,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxUses: dto.maxUses ?? null,
      },
      include: { influencer: true },
    });

    this.logger.log(
      `Influencer discount created: ${discount.code} for influencer ${influencer.name} (${influencer.id})`,
    );
    return discount;
  }

  async findAllInfluencerDiscounts(query: QueryInfluencerDiscountsDto) {
    const { page = 1, limit = 20, search, influencerId, isActive } = query;

    const where: any = { type: DiscountType.INFLUENCER };
    if (influencerId) where.influencerId = influencerId;
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
        include: {
          influencer: true,
          _count: { select: { usages: true } },
        },
      }),
      this.prisma.discountCode.count({ where }),
    ]);

    // Aggregate stats per code
    const codesWithStats = await Promise.all(
      codes.map(async (c) => {
        const [discountGiven, rewardsPaid] = await Promise.all([
          this.prisma.discountUsage.aggregate({
            where: { discountCodeId: c.id },
            _sum: { discountAmount: true },
          }),
          this.prisma.influencerReward.aggregate({
            where: {
              usage: { discountCodeId: c.id },
              status: ReferralStatus.REWARDED,
            },
            _sum: { rewardAmount: true },
          }),
        ]);
        return {
          ...c,
          stats: {
            totalUsages: c._count.usages,
            totalDiscountGiven: Number(discountGiven._sum.discountAmount ?? 0),
            totalRewardsPaid: Number(rewardsPaid._sum.rewardAmount ?? 0),
          },
        };
      }),
    );

    return {
      discounts: codesWithStats,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneInfluencerDiscount(id: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { id },
      include: {
        influencer: true,
        usages: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            booking: {
              select: {
                id: true,
                totalAmount: true,
                createdAt: true,
                status: true,
              },
            },
            influencerReward: true,
          },
        },
      },
    });

    if (!discount)
      throw new NotFoundException('Influencer discount code not found');
    if (discount.type !== DiscountType.INFLUENCER) {
      throw new BadRequestException('This is not an influencer discount code');
    }

    const [discountGiven, rewardsPaid] = await Promise.all([
      this.prisma.discountUsage.aggregate({
        where: { discountCodeId: id },
        _sum: { discountAmount: true },
      }),
      this.prisma.influencerReward.aggregate({
        where: {
          usage: { discountCodeId: id },
          status: ReferralStatus.REWARDED,
        },
        _sum: { rewardAmount: true },
      }),
    ]);

    return {
      ...discount,
      stats: {
        totalUsages: discount.usages.length,
        totalDiscountGiven: Number(discountGiven._sum.discountAmount ?? 0),
        totalRewardsPaid: Number(rewardsPaid._sum.rewardAmount ?? 0),
      },
    };
  }

  async deleteInfluencerDiscount(id: string) {
    const discount = await this.prisma.discountCode.findUnique({
      where: { id },
    });
    if (!discount)
      throw new NotFoundException('Influencer discount code not found');
    if (discount.type !== DiscountType.INFLUENCER) {
      throw new BadRequestException(
        'Use the standard delete endpoint for general discount codes',
      );
    }
    await this.prisma.discountCode.delete({ where: { id } });
    this.logger.log(`Influencer discount deleted: ${id}`);
  }

  // ─── Influencer Reward Settings ───────────────────────────────────────────

  async getInfluencerRewardSettings(): Promise<InfluencerRewardSettings> {
    const cached = await this.redis.get<InfluencerRewardSettings>(
      'influencer:reward-settings',
    );
    if (cached) return cached;

    let settings = await this.prisma.influencerRewardSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.influencerRewardSettings.create({
        data: {
          isActive: false,
          rewardType: ReferralRewardType.FIXED,
          rewardValue: 0,
          minPurchaseAmount: 0,
        },
      });
    }

    await this.redis.set('influencer:reward-settings', settings, 300);
    return settings;
  }

  async updateInfluencerRewardSettings(dto: UpdateInfluencerRewardSettingsDto) {
    if (
      dto.rewardType === ReferralRewardType.PERCENTAGE &&
      dto.rewardValue !== undefined &&
      dto.rewardValue > 100
    ) {
      throw new BadRequestException(
        'Percentage reward value cannot exceed 100',
      );
    }

    const existing = await this.prisma.influencerRewardSettings.findFirst();

    const settings = existing
      ? await this.prisma.influencerRewardSettings.update({
          where: { id: existing.id },
          data: {
            ...(dto.isActive !== undefined && { isActive: dto.isActive }),
            ...(dto.rewardType !== undefined && { rewardType: dto.rewardType }),
            ...(dto.rewardValue !== undefined && {
              rewardValue: dto.rewardValue,
            }),
            ...(dto.minPurchaseAmount !== undefined && {
              minPurchaseAmount: dto.minPurchaseAmount,
            }),
          },
        })
      : await this.prisma.influencerRewardSettings.create({
          data: {
            isActive: dto.isActive ?? false,
            rewardType: dto.rewardType ?? ReferralRewardType.FIXED,
            rewardValue: dto.rewardValue ?? 0,
            minPurchaseAmount: dto.minPurchaseAmount ?? 0,
          },
        });

    await this.redis.del('influencer:reward-settings');
    this.logger.log('Influencer reward settings updated');
    return settings;
  }

  // ─── Reward Processing (called from BookingService) ───────────────────────

  async processInfluencerReward(
    usageId: string,
    paidAmount: number,
  ): Promise<void> {
    try {
      const usage = await this.prisma.discountUsage.findUnique({
        where: { id: usageId },
        include: { discountCode: true },
      });

      if (!usage) {
        this.logger.warn(`processInfluencerReward: usage ${usageId} not found`);
        return;
      }

      if (usage.discountCode.type !== DiscountType.INFLUENCER) return;

      const influencerId = usage.discountCode.influencerId;
      if (!influencerId) return;

      const settings = await this.getInfluencerRewardSettings();
      if (!settings.isActive) {
        this.logger.log('Influencer reward system inactive — skipping');
        return;
      }

      if (paidAmount < Number(settings.minPurchaseAmount)) {
        this.logger.log(
          `Booking ₦${paidAmount} below min ₦${settings.minPurchaseAmount} — skipping influencer reward`,
        );
        return;
      }

      // Idempotency guard
      const existing = await this.prisma.influencerReward.findUnique({
        where: { usageId },
      });
      if (existing) {
        this.logger.log(
          `Reward for usage ${usageId} already exists — skipping`,
        );
        return;
      }

      const discountAmount = Number(usage.discountAmount);
      let rewardAmount: number;
      if (settings.rewardType === ReferralRewardType.FIXED) {
        rewardAmount = Number(settings.rewardValue);
      } else {
        rewardAmount = Math.min(
          (discountAmount * Number(settings.rewardValue)) / 100,
          discountAmount,
        );
      }

      rewardAmount = Math.round(rewardAmount * 100) / 100;

      if (rewardAmount <= 0) {
        this.logger.warn(
          'Calculated influencer reward is zero or negative — skipping',
        );
        return;
      }

      // Record reward as REWARDED immediately on booking confirmation
      await this.prisma.influencerReward.create({
        data: {
          influencerId,
          usageId,
          rewardAmount,
          status: ReferralStatus.REWARDED,
        },
      });

      this.logger.log(
        `Influencer reward confirmed: ₦${rewardAmount} rewarded to influencer ${influencerId} (usage ${usageId})`,
      );
    } catch (err) {
      this.logger.error(
        `processInfluencerReward failed for usage ${usageId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Non-fatal — never throw
    }
  }
}
