import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { KycStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';

interface QoreIdSessionResponse {
  sessionId: string;
  sdkSessionToken: string;
  expiresAt: string;
}

/** Extra runtime checks beyond class-validator (host, scheme, no userinfo). */
function assertSafePortfolioUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('portfolioUrl must be a valid https URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('portfolioUrl must use https');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException(
      'portfolioUrl must not include credentials',
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal')
  ) {
    throw new BadRequestException(
      'portfolioUrl must be a public https URL',
    );
  }

  // Normalize: drop hash; keep pathname/query as provided by the beautician
  parsed.hash = '';
  return parsed.toString();
}

@Injectable()
export class QoreidSessionService {
  private readonly logger = new Logger(QoreidSessionService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async initiateSession(userId: string, portfolioUrl: string) {
    const safePortfolioUrl = assertSafePortfolioUrl(portfolioUrl);

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new BadRequestException('Beautician profile not found');
    }

    if (
      profile.kycStatus === KycStatus.VERIFIED ||
      profile.kycStatus === KycStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        `KYC cannot be initiated while status is ${profile.kycStatus}`,
      );
    }

    const clientId = this.configService.get<string>('QOREID_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QOREID_CLIENT_SECRET');
    const workflowId = this.configService.get<string>('QOREID_WORKFLOW_ID');
    const apiBase =
      this.configService.get<string>('QOREID_API_BASE_URL') ||
      'https://api.qoreid.com';

    if (!clientId || !clientSecret || !workflowId) {
      throw new ServiceUnavailableException(
        'QoreID integration is not configured',
      );
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<QoreIdSessionResponse>(
          `${apiBase}/v1/sessions`,
          {
            type: 'workflow',
            workflowId: Number(workflowId),
            reference: userId,
            customerReference: userId,
            subjectRef: userId,
            ttlSeconds: 900,
          },
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      await this.prisma.beauticianProfile.update({
        where: { userId },
        data: {
          kycStatus: KycStatus.IN_PROGRESS,
          qoreIdSessionId: data.sessionId,
          portfolioUrl: safePortfolioUrl,
        },
      });

      // Keep GET /beauticians/me cache in sync (same key as KycProfilePhotoService)
      await this.redis.del(`beautician:me:stable:${userId}`);

      const expiresAt = new Date(data.expiresAt);
      const expiresIn = Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      );

      return {
        sessionToken: data.sdkSessionToken,
        sessionId: data.sessionId,
        expiresIn,
        expiresAt: data.expiresAt,
        portfolioUrl: safePortfolioUrl,
        instructions:
          'Launch the QoreID React Native SDK with this sessionToken',
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `QoreID session creation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException(
        'Unable to initiate KYC session. Please try again later.',
      );
    }
  }
}