import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInfluencerDto } from './dto/create-influencer.dto';
import { UpdateInfluencerDto } from './dto/update-influencer.dto';
import { QueryInfluencersDto } from './dto/query-influencers.dto';

@Injectable()
export class InfluencerService {
  private readonly logger = new Logger(InfluencerService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateInfluencerDto) {
    const existing = await this.prisma.influencer.findUnique({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException(
        `An influencer with phone "${dto.phone}" already exists`,
      );
    }

    const influencer = await this.prisma.influencer.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(
      `Influencer created: ${influencer.name} (${influencer.id})`,
    );
    return influencer;
  }

  async findAll(query: QueryInfluencersDto) {
    const { page = 1, limit = 20, search, isActive } = query;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [influencers, total] = await Promise.all([
      this.prisma.influencer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { discountCodes: true } },
        },
      }),
      this.prisma.influencer.count({ where }),
    ]);

    return {
      influencers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { id },
      include: {
        discountCodes: {
          select: {
            id: true,
            code: true,
            name: true,
            percentage: true,
            isActive: true,
            usedCount: true,
            expiresAt: true,
          },
        },
        influencerRewards: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            rewardAmount: true,
            status: true,
            createdAt: true,
          },
        },
        _count: { select: { discountCodes: true, influencerRewards: true } },
      },
    });

    if (!influencer) throw new NotFoundException('Influencer not found');

    // Aggregate total earned
    const earned = await this.prisma.influencerReward.aggregate({
      where: { influencerId: id, status: 'REWARDED' },
      _sum: { rewardAmount: true },
    });

    return {
      ...influencer,
      totalEarned: Number(earned._sum.rewardAmount ?? 0),
    };
  }

  async update(id: string, dto: UpdateInfluencerDto) {
    await this.findOne(id);

    if (dto.phone) {
      const conflict = await this.prisma.influencer.findFirst({
        where: { phone: dto.phone, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `Another influencer already uses phone "${dto.phone}"`,
        );
      }
    }

    const influencer = await this.prisma.influencer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.logger.log(`Influencer updated: ${id}`);
    return influencer;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.influencer.delete({ where: { id } });
    this.logger.log(`Influencer deleted: ${id}`);
  }
}
