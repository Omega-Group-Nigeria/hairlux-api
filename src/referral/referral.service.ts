import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  Prisma,
  ReferralRewardType,
  ReferralSettings,
  ReferralStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { QueryReferralsDto } from './dto/query-referrals.dto';
import { CreateReferralCampaignCodeDto } from './dto/create-referral-campaign-code.dto';
import { UpdateReferralCampaignCodeDto } from './dto/update-referral-campaign-code.dto';
import { QueryReferralCampaignCodesDto } from './dto/query-referral-campaign-codes.dto';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0,O,1,I to avoid confusion
const CODE_SUFFIX_LEN = 4;
const MAX_CODE_RETRIES = 5;
const CACHE_TTL_SETTINGS = 300; // 5 min

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mailService: MailService,
  ) {}

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private buildSuffix(): string {
    let suffix = '';
    const bytes = randomBytes(CODE_SUFFIX_LEN);
    for (let i = 0; i < CODE_SUFFIX_LEN; i++) {
      suffix += CHARS[bytes[i] % CHARS.length];
    }
    return suffix;
  }

  private buildCode(firstName: string): string {
    const prefix = firstName
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 3)
      .toUpperCase()
      .padEnd(3, 'X');
    return `${prefix}-${this.buildSuffix()}`;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private validateCampaignWindow(
    startsAt?: Date | null,
    expiresAt?: Date | null,
  ): void {
    if (startsAt && expiresAt && startsAt >= expiresAt) {
      throw new BadRequestException('startsAt must be earlier than expiresAt');
    }
  }

  private async ensureCodeNotReserved(
    code: string,
    ignoreCampaignId?: string,
  ): Promise<void> {
    const [userReferralCode, existingCampaignCode] = await Promise.all([
      this.prisma.referralCode.findUnique({ where: { code } }),
      this.prisma.referralCampaignCode.findUnique({ where: { code } }),
    ]);

    if (userReferralCode) {
      throw new BadRequestException(
        'Code is already assigned to an existing user referral code',
      );
    }

    if (existingCampaignCode && existingCampaignCode.id !== ignoreCampaignId) {
      throw new BadRequestException('Campaign code already exists');
    }
  }

  // ─── Called from AuthService after user creation ──────────────────────────

  async createReferralCode(userId: string, firstName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      const code = this.buildCode(firstName);
      try {
        await this.prisma.referralCode.create({
          data: { userId, code },
        });
        return code;
      } catch (err) {
        // Unique constraint violation — try again
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    // Fallback: full random hex
    const fallbackCode = randomBytes(5).toString('hex').toUpperCase();
    await this.prisma.referralCode.create({
      data: { userId, code: fallbackCode },
    });
    return fallbackCode;
  }

  async applySignupCode(userId: string, rawCode: string): Promise<void> {
    const code = this.normalizeCode(rawCode);

    if (!code) {
      return;
    }

    const campaignCode = await this.prisma.referralCampaignCode.findUnique({
      where: { code },
      select: { id: true },
    });

    if (campaignCode) {
      await this.applyReferralCampaignSignupBonus(userId, code);
      return;
    }

    await this.linkReferral(userId, code);
  }

  private async applyReferralCampaignSignupBonus(
    userId: string,
    code: string,
  ): Promise<void> {
    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const campaign = await tx.referralCampaignCode.findUnique({
        where: { code },
      });

      if (!campaign) {
        return { status: 'NOT_FOUND' as const };
      }

      if (!campaign.isActive) {
        return { status: 'INACTIVE' as const, code: campaign.code };
      }

      if (campaign.startsAt && campaign.startsAt > now) {
        return { status: 'NOT_STARTED' as const, code: campaign.code };
      }

      if (campaign.expiresAt && campaign.expiresAt < now) {
        return { status: 'EXPIRED' as const, code: campaign.code };
      }

      if (campaign.maxUses !== null && campaign.usedCount >= campaign.maxUses) {
        return { status: 'LIMIT_REACHED' as const, code: campaign.code };
      }

      const existingUsage = await tx.referralCampaignCodeUsage.findUnique({
        where: { userId },
      });

      if (existingUsage) {
        return { status: 'ALREADY_USED' as const, code: campaign.code };
      }

      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) {
        return { status: 'WALLET_MISSING' as const, code: campaign.code };
      }

      const bonusAmount = Number(campaign.signupBonusAmount);

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: 'CREDIT',
          amount: bonusAmount,
          status: 'COMPLETED',
          paymentMethod: 'REFERRAL',
          reference: `SIGNUP-CODE-${campaign.id}-${userId}`,
          description: `Signup bonus via referral campaign code ${campaign.code}`,
        },
      });

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: bonusAmount },
        },
      });

      await tx.referralCampaignCodeUsage.create({
        data: {
          campaignCodeId: campaign.id,
          userId,
          transactionId: transaction.id,
          bonusAmount,
        },
      });

      await tx.referralCampaignCode.update({
        where: { id: campaign.id },
        data: {
          usedCount: { increment: 1 },
        },
      });

      return {
        status: 'APPLIED' as const,
        code: campaign.code,
        bonusAmount,
      };
    });

    if (result.status === 'APPLIED') {
      this.logger.log(
        `Referral campaign code applied: code=${result.code}, user=${userId}, bonus=₦${result.bonusAmount}`,
      );

      void Promise.all([
        this.redis.del(`wallet:balance:${userId}`),
        this.redis.del('wallet:admin-stats'),
        this.redis.delByPattern('analytics:*'),
      ]);

      return;
    }

    if (result.status === 'ALREADY_USED') {
      this.logger.warn(
        `User ${userId} has already used a referral campaign code`,
      );
      return;
    }

    if (result.status === 'WALLET_MISSING') {
      this.logger.warn(
        `Wallet missing while applying referral campaign code for user ${userId}`,
      );
      return;
    }

    if (result.status !== 'NOT_FOUND') {
      this.logger.warn(
        `Referral campaign code not applied for user ${userId}: ${result.status}`,
      );
    }
  }

  // ─── Called from AuthService — links referral at signup (non-fatal) ────────

  async linkReferral(referredUserId: string, code: string): Promise<void> {
    const normalizedCode = this.normalizeCode(code);

    const referralCode = await this.prisma.referralCode.findUnique({
      where: { code: normalizedCode },
    });

    if (!referralCode) {
      this.logger.warn(`Referral code not found: ${normalizedCode}`);
      return;
    }

    // Prevent self-referral
    if (referralCode.userId === referredUserId) {
      this.logger.warn(
        `Self-referral attempt by user ${referredUserId} with code ${code}`,
      );
      return;
    }

    try {
      await this.prisma.referral.create({
        data: {
          referrerId: referralCode.userId,
          referredId: referredUserId,
          code: referralCode.code,
          status: ReferralStatus.PENDING,
        },
      });
      this.logger.log(
        `Referral linked: referrer=${referralCode.userId}, referred=${referredUserId}`,
      );

      // Immediately process reward (non-fatal — PERCENTAGE type defers to deposit webhook)
      void this.processReward(referredUserId);
    } catch (err) {
      // P2002 = unique violation on referredId (already referred) — silent ignore
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          `User ${referredUserId} already has a referral record`,
        );
        return;
      }
      throw err;
    }
  }

  // ─── Called at signup (linkReferral) or after deposit (Paystack webhook) ──
  // depositAmount is undefined when called at signup — skips min-deposit check.
  // PERCENTAGE reward type requires a real depositAmount; it stays PENDING at
  // signup and is resolved by the Paystack webhook on first deposit instead.

  async processReward(
    referredUserId: string,
    depositAmount?: number,
  ): Promise<void> {
    // Find pending referral for this user
    const referral = await this.prisma.referral.findUnique({
      where: { referredId: referredUserId },
    });

    if (!referral || referral.status !== ReferralStatus.PENDING) {
      return; // Not a referred user or already processed
    }

    // Fetch settings
    const settings = await this.getSettings();

    if (!settings || !settings.isActive) {
      this.logger.log('Referral system is inactive — skipping reward');
      return;
    }

    const isSignup = depositAmount === undefined;

    // PERCENTAGE type needs a real deposit amount — defer to deposit webhook
    if (isSignup && settings.rewardType === ReferralRewardType.PERCENTAGE) {
      this.logger.log(
        'PERCENTAGE reward type — deferring to deposit webhook for reward calculation',
      );
      return;
    }

    // Enforce minimum deposit amount only when triggered by a deposit
    if (!isSignup && depositAmount! < Number(settings.minDepositAmount)) {
      this.logger.log(
        `Deposit ₦${depositAmount} below min ₦${settings.minDepositAmount} — skipping referral reward`,
      );
      return;
    }

    // Calculate reward
    let rewardAmount: number;
    if (settings.rewardType === ReferralRewardType.FIXED) {
      rewardAmount = Number(settings.rewardValue);
    } else {
      // PERCENTAGE — cap at deposit amount to avoid crediting more than deposited
      rewardAmount = Math.min(
        (depositAmount! * Number(settings.rewardValue)) / 100,
        depositAmount!,
      );
    }

    rewardAmount = Math.round(rewardAmount * 100) / 100; // 2 dp

    if (rewardAmount <= 0) {
      this.logger.warn(
        'Calculated referral reward is zero or negative — skipping',
      );
      return;
    }

    // Atomically credit referrer wallet + update referral record
    try {
      await this.prisma.$transaction(async (tx) => {
        // Re-check status inside transaction (idempotency guard)
        const locked = await tx.referral.findUnique({
          where: { referredId: referredUserId },
        });
        if (!locked || locked.status !== ReferralStatus.PENDING) {
          throw new Error('ALREADY_PROCESSED');
        }

        const referrerWallet = await tx.wallet.findUnique({
          where: { userId: referral.referrerId },
        });
        if (!referrerWallet) {
          throw new Error('REFERRER_WALLET_MISSING');
        }

        // Credit referrer wallet
        await tx.wallet.update({
          where: { userId: referral.referrerId },
          data: { balance: { increment: rewardAmount } },
        });

        // Record transaction
        await tx.transaction.create({
          data: {
            walletId: referrerWallet.id,
            type: 'CREDIT',
            amount: rewardAmount,
            status: 'COMPLETED',
            paymentMethod: 'REFERRAL',
            reference: `REFERRAL-${referral.id}`,
            description: 'Referral reward',
          },
        });

        // Update referral record
        await tx.referral.update({
          where: { referredId: referredUserId },
          data: {
            status: ReferralStatus.REWARDED,
            rewardAmount,
          },
        });

        // Increment referralCode stats
        await tx.referralCode.update({
          where: { code: referral.code },
          data: {
            totalUses: { increment: 1 },
            totalEarned: { increment: rewardAmount },
          },
        });
      });

      this.logger.log(
        `Referral reward processed: ₦${rewardAmount} credited to referrer ${referral.referrerId}`,
      );

      // Invalidate caches
      void Promise.all([
        this.redis.del(`wallet:balance:${referral.referrerId}`),
        this.redis.del('wallet:admin-stats'),
        this.redis.delByPattern('analytics:*'),
      ]);

      // Send reward email (non-fatal)
      try {
        const [referrerWallet, referredUser] = await Promise.all([
          this.prisma.wallet.findUnique({
            where: { userId: referral.referrerId },
            include: { user: { select: { email: true, firstName: true } } },
          }),
          this.prisma.user.findUnique({
            where: { id: referredUserId },
            select: { firstName: true, lastName: true },
          }),
        ]);

        if (referrerWallet?.user && referredUser) {
          await this.mailService.sendReferralRewardEmail(
            referrerWallet.user.email,
            referrerWallet.user.firstName,
            {
              earnedAmount: rewardAmount,
              referredName: `${referredUser.firstName} ${referredUser.lastName}`,
              newBalance: Number(referrerWallet.balance),
            },
          );
        }
      } catch (mailErr) {
        this.logger.warn(
          `Referral reward email failed (non-fatal): ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`,
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'ALREADY_PROCESSED') {
        this.logger.warn(
          `Referral for ${referredUserId} already processed (idempotency guard)`,
        );
        return;
      }
      // Mark as FAILED so we can inspect without retrying automatically
      await this.prisma.referral
        .update({
          where: { referredId: referredUserId },
          data: { status: ReferralStatus.FAILED },
        })
        .catch((updateErr) =>
          this.logger.error('Failed to mark referral as FAILED', updateErr),
        );
      this.logger.error(
        `Referral reward processing failed for ${referredUserId}:`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ─── User-facing ──────────────────────────────────────────────────────────

  async getMyCode(userId: string) {
    const referralCode = await this.prisma.referralCode.findUnique({
      where: { userId },
    });
    if (!referralCode) {
      throw new NotFoundException('Referral code not found for this user');
    }
    return referralCode;
  }

  async getMyHistory(userId: string) {
    const referrals = await this.prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        referred: {
          select: {
            firstName: true,
            lastName: true,
            createdAt: true,
          },
        },
      },
    });
    return referrals;
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async getSettings() {
    const cached = await this.redis.get<ReferralSettings>('referral:settings');
    if (cached) return cached;

    const settings = await this.prisma.referralSettings.findFirst();
    if (settings) {
      void this.redis.set('referral:settings', settings, CACHE_TTL_SETTINGS);
    }
    return settings;
  }

  async upsertSettings(dto: UpdateReferralSettingsDto) {
    // Validate: PERCENTAGE rewardValue must be ≤ 100
    if (
      dto.rewardType === ReferralRewardType.PERCENTAGE &&
      dto.rewardValue !== undefined &&
      dto.rewardValue > 100
    ) {
      throw new BadRequestException(
        'rewardValue must be ≤ 100 for PERCENTAGE reward type',
      );
    }

    const existing = await this.prisma.referralSettings.findFirst();

    const settings = existing
      ? await this.prisma.referralSettings.update({
          where: { id: existing.id },
          data: dto,
        })
      : await this.prisma.referralSettings.create({
          data: {
            isActive: dto.isActive ?? false,
            rewardType: dto.rewardType ?? ReferralRewardType.FIXED,
            rewardValue: dto.rewardValue ?? 0,
            minDepositAmount: dto.minDepositAmount ?? 0,
          },
        });

    void this.redis.del('referral:settings');
    return settings;
  }

  async createCampaignCode(dto: CreateReferralCampaignCodeDto) {
    const code = this.normalizeCode(dto.code);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    this.validateCampaignWindow(startsAt, expiresAt);
    await this.ensureCodeNotReserved(code);

    return this.prisma.referralCampaignCode.create({
      data: {
        code,
        name: dto.name.trim(),
        description: dto.description,
        signupBonusAmount: dto.signupBonusAmount,
        isActive: dto.isActive ?? true,
        startsAt,
        expiresAt,
        maxUses: dto.maxUses ?? null,
      },
    });
  }

  async getCampaignCodes(query: QueryReferralCampaignCodesDto) {
    const { page = 1, limit = 20, isActive, code } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralCampaignCodeWhereInput = {};
    if (isActive === 'true') {
      where.isActive = true;
    } else if (isActive === 'false') {
      where.isActive = false;
    }
    if (code) {
      where.code = {
        contains: code,
        mode: 'insensitive',
      };
    }

    const [total, campaignCodes] = await Promise.all([
      this.prisma.referralCampaignCode.count({ where }),
      this.prisma.referralCampaignCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { usages: true },
          },
        },
      }),
    ]);

    return {
      data: campaignCodes,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCampaignCodeById(id: string) {
    const campaignCode = await this.prisma.referralCampaignCode.findUnique({
      where: { id },
      include: {
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!campaignCode) {
      throw new NotFoundException('Referral campaign code not found');
    }

    return campaignCode;
  }

  async updateCampaignCode(id: string, dto: UpdateReferralCampaignCodeDto) {
    const existing = await this.prisma.referralCampaignCode.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Referral campaign code not found');
    }

    const updatedCode = dto.code ? this.normalizeCode(dto.code) : existing.code;

    if (updatedCode !== existing.code) {
      await this.ensureCodeNotReserved(updatedCode, existing.id);
    }

    const startsAt =
      dto.startsAt !== undefined
        ? dto.startsAt
          ? new Date(dto.startsAt)
          : null
        : existing.startsAt;

    const expiresAt =
      dto.expiresAt !== undefined
        ? dto.expiresAt
          ? new Date(dto.expiresAt)
          : null
        : existing.expiresAt;

    this.validateCampaignWindow(startsAt, expiresAt);

    return this.prisma.referralCampaignCode.update({
      where: { id },
      data: {
        code: updatedCode,
        name: dto.name?.trim(),
        description: dto.description,
        signupBonusAmount: dto.signupBonusAmount,
        isActive: dto.isActive,
        startsAt,
        expiresAt,
        maxUses: dto.maxUses,
      },
    });
  }

  async deleteCampaignCode(id: string) {
    const existing = await this.prisma.referralCampaignCode.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        isActive: true,
        usedCount: true,
        updatedAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Referral campaign code not found');
    }

    if (existing.usedCount === 0) {
      const deleted = await this.prisma.referralCampaignCode.delete({
        where: { id },
        select: {
          id: true,
          code: true,
          usedCount: true,
        },
      });

      return {
        action: 'DELETED' as const,
        message: 'Campaign code deleted successfully',
        data: deleted,
      };
    }

    if (!existing.isActive) {
      return {
        action: 'DEACTIVATED' as const,
        message: 'Campaign code has usage history and is already inactive',
        data: existing,
      };
    }

    const deactivated = await this.prisma.referralCampaignCode.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        code: true,
        isActive: true,
        usedCount: true,
        updatedAt: true,
      },
    });

    return {
      action: 'DEACTIVATED' as const,
      message:
        'Campaign code has usage history and was deactivated instead of deleted',
      data: deactivated,
    };
  }

  async getAllReferrals(query: QueryReferralsDto) {
    const { page = 1, limit = 20, status, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReferralWhereInput = {};
    if (status) where.status = status;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [total, referrals] = await Promise.all([
      this.prisma.referral.count({ where }),
      this.prisma.referral.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          referrer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data: referrals,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const [total, rewarded, failed, pending, totalEarnedRow] =
      await Promise.all([
        this.prisma.referral.count(),
        this.prisma.referral.count({
          where: { status: ReferralStatus.REWARDED },
        }),
        this.prisma.referral.count({
          where: { status: ReferralStatus.FAILED },
        }),
        this.prisma.referral.count({
          where: { status: ReferralStatus.PENDING },
        }),
        this.prisma.referralCode.aggregate({ _sum: { totalEarned: true } }),
      ]);

    return {
      total,
      rewarded,
      failed,
      pending,
      totalRewarded: Number(totalEarnedRow._sum.totalEarned ?? 0),
    };
  }

  async getReferralsByUser(userId: string) {
    const [referralCode, referrals, referredBy] = await Promise.all([
      this.prisma.referralCode.findUnique({ where: { userId } }),
      this.prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        include: {
          referred: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.referral.findUnique({
        where: { referredId: userId },
        include: {
          referrer: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    return {
      referralCode,
      referrals,
      referredBy: referredBy ?? null,
    };
  }
}
