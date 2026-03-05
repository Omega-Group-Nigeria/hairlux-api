import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PromoteInfluencerDto } from './dto/promote-influencer.dto';
import { UpdateInfluencerDto } from './dto/update-influencer.dto';
import { QueryInfluencersDto } from './dto/query-influencers.dto';
import { QueryInfluencerRewardsDto } from './dto/query-influencer-rewards.dto';

@Injectable()
export class InfluencerService {
  private readonly logger = new Logger(InfluencerService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Admin: Promote / Demote ──────────────────────────────────────────────

  async promoteUser(userId: string, dto: PromoteInfluencerDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { influencer: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (user.influencer) {
      if (!user.influencer.isActive) {
        const updated = await this.prisma.influencer.update({
          where: { userId },
          data: { isActive: true, notes: dto.notes ?? user.influencer.notes },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        });
        this.logger.log(`Influencer re-activated: ${userId}`);
        return updated;
      }
      throw new ConflictException('This user is already an active influencer');
    }

    const influencer = await this.prisma.influencer.create({
      data: { userId, notes: dto.notes ?? null, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    this.logger.log(`User promoted to influencer: ${userId}`);
    return influencer;
  }

  async demoteUser(userId: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { userId },
    });
    if (!influencer)
      throw new NotFoundException('This user is not an influencer');

    await this.prisma.$transaction([
      this.prisma.influencer.update({
        where: { userId },
        data: { isActive: false },
      }),
      this.prisma.discountCode.updateMany({
        where: { influencerId: influencer.id },
        data: { isActive: false },
      }),
    ]);

    this.logger.log(
      `User demoted from influencer: ${userId} — discount codes deactivated`,
    );
  }

  async demoteById(id: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { id },
    });
    if (!influencer) throw new NotFoundException('Influencer not found');
    return this.demoteUser(influencer.userId);
  }

  // ─── Admin: List & Read ───────────────────────────────────────────────────

  async findAll(query: QueryInfluencersDto) {
    const { page = 1, limit = 20, search, isActive } = query;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ],
      };
    }

    const [influencers, total] = await Promise.all([
      this.prisma.influencer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          _count: { select: { discountCodes: true, influencerRewards: true } },
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
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
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
    const influencer = await this.prisma.influencer.findUnique({
      where: { id },
    });
    if (!influencer) throw new NotFoundException('Influencer not found');

    return this.prisma.influencer.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });
  }

  // ─── Self-service (authenticated influencer user) ─────────────────────────

  async getMyProfile(userId: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        _count: { select: { discountCodes: true, influencerRewards: true } },
      },
    });

    if (!influencer) throw new ForbiddenException('You are not an influencer');
    if (!influencer.isActive)
      throw new ForbiddenException('Your influencer account is inactive');

    const [earned, wallet] = await Promise.all([
      this.prisma.influencerReward.aggregate({
        where: { influencerId: influencer.id, status: 'REWARDED' },
        _sum: { rewardAmount: true },
      }),
      this.prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true },
      }),
    ]);

    return {
      ...influencer,
      totalEarned: Number(earned._sum.rewardAmount ?? 0),
      walletBalance: Number(wallet?.balance ?? 0),
    };
  }

  async getMyCodes(userId: string) {
    const influencer = await this.prisma.influencer.findUnique({
      where: { userId },
    });
    if (!influencer || !influencer.isActive)
      throw new ForbiddenException('You are not an active influencer');

    return this.prisma.discountCode.findMany({
      where: { influencerId: influencer.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        code: true,
        name: true,
        percentage: true,
        isActive: true,
        usedCount: true,
        startsAt: true,
        expiresAt: true,
        maxUses: true,
        createdAt: true,
      },
    });
  }

  async getMyRewards(userId: string, query: QueryInfluencerRewardsDto) {
    const { page = 1, limit = 20 } = query;
    const influencer = await this.prisma.influencer.findUnique({
      where: { userId },
    });
    if (!influencer || !influencer.isActive)
      throw new ForbiddenException('You are not an active influencer');

    const [rewards, total, totalEarned] = await Promise.all([
      this.prisma.influencerReward.findMany({
        where: { influencerId: influencer.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rewardAmount: true,
          status: true,
          createdAt: true,
          usage: {
            select: {
              discountAmount: true,
              discountCode: {
                select: { code: true, name: true, percentage: true },
              },
            },
          },
        },
      }),
      this.prisma.influencerReward.count({
        where: { influencerId: influencer.id },
      }),
      this.prisma.influencerReward.aggregate({
        where: { influencerId: influencer.id, status: 'REWARDED' },
        _sum: { rewardAmount: true },
      }),
    ]);

    return {
      rewards,
      totalEarned: Number(totalEarned._sum.rewardAmount ?? 0),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
