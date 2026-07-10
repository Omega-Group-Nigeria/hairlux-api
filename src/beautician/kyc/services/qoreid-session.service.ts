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

interface QoreIdSessionResponse {
  sessionId: string;
  sdkSessionToken: string;
  expiresAt: string;
}

@Injectable()
export class QoreidSessionService {
  private readonly logger = new Logger(QoreidSessionService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async initiateSession(userId: string) {
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
        },
      });

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
        instructions:
          'Launch the QoreID React Native SDK with this sessionToken',
      };
    } catch (error) {
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