import { Injectable } from '@nestjs/common';
import { FcmPlatform } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FcmTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async registerToken(
    userId: string,
    token: string,
    platform: FcmPlatform,
  ) {
    const record = await this.prisma.fcmToken.upsert({
      where: {
        userId_token: { userId, token },
      },
      create: {
        userId,
        token,
        platform,
      },
      update: {
        platform,
        lastUsedAt: new Date(),
      },
    });

    return {
      id: record.id,
      platform: record.platform,
      lastUsedAt: record.lastUsedAt,
    };
  }

  async listTokensForUser(userId: string) {
    return this.prisma.fcmToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });
  }
}