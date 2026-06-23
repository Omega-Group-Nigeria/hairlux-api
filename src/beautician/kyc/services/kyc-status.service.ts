import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { BeauticianNotificationService } from '../../notification/services/beautician-notification.service';
import { serializeBeauticianProfile } from '../../utils/beautician-profile.utils';

@Injectable()
export class KycStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: BeauticianNotificationService,
  ) {}

  async getStatus(userId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      select: {
        kycStatus: true,
        kycVerifiedAt: true,
        qoreIdSessionId: true,
        qoreIdCustomerId: true,
        reviewNotes: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    return profile;
  }

  async adminApprove(profileId: string, adminUserId: string) {
    const profile = await this.requireProfile(profileId);

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        kycStatus: KycStatus.VERIFIED,
        kycVerifiedAt: new Date(),
        reviewNotes: null,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await this.notificationService.notifyKycResult(updated.user, 'VERIFIED');

    return serializeBeauticianProfile(updated);
  }

  async adminReject(profileId: string, reason: string) {
    const profile = await this.requireProfile(profileId);

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        kycStatus: KycStatus.REJECTED,
        reviewNotes: reason,
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    await this.notificationService.notifyKycResult(
      updated.user,
      'REJECTED',
      reason,
    );

    return serializeBeauticianProfile(updated);
  }

  async applyWebhookUpdate(payload: Record<string, unknown>) {
    let userId = this.resolveUserId(payload);

    if (!userId) {
      const sessionId = this.extractSessionId(payload);
      if (sessionId) {
        const bySession = await this.prisma.beauticianProfile.findFirst({
          where: { qoreIdSessionId: sessionId },
          select: { userId: true },
        });
        userId = bySession?.userId ?? null;
      }
    }

    if (!userId) {
      throw new BadRequestException('Unable to resolve beautician from webhook');
    }

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found for webhook');
    }

    const mappedStatus = await this.mapWebhookStatus(payload);
    const qoreIdCustomerId = this.extractCustomerId(payload);

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        kycStatus: mappedStatus,
        ...(mappedStatus === KycStatus.VERIFIED && {
          kycVerifiedAt: new Date(),
        }),
        ...(qoreIdCustomerId && { qoreIdCustomerId }),
      },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });

    if (
      mappedStatus === KycStatus.VERIFIED ||
      mappedStatus === KycStatus.REJECTED ||
      mappedStatus === KycStatus.NEEDS_REVIEW
    ) {
      await this.notificationService.notifyKycResult(
        updated.user,
        mappedStatus === KycStatus.VERIFIED
          ? 'VERIFIED'
          : mappedStatus === KycStatus.REJECTED
            ? 'REJECTED'
            : 'NEEDS_REVIEW',
      );
    }

    return updated;
  }

  private async mapWebhookStatus(
    payload: Record<string, unknown>,
  ): Promise<KycStatus> {
    const rawStatus = this.extractStatus(payload);
    const normalized = String(rawStatus ?? '').toLowerCase();

    if (
      ['verified', 'success', 'successful', 'completed', 'approved'].includes(
        normalized,
      )
    ) {
      const settings = await this.prisma.homeServiceSettings.findFirst();
      const autoApprove = settings?.kycAutoApprove ?? true;
      return autoApprove ? KycStatus.VERIFIED : KycStatus.NEEDS_REVIEW;
    }

    if (['rejected', 'failed', 'failure', 'declined'].includes(normalized)) {
      return KycStatus.REJECTED;
    }

    if (
      ['needs_review', 'review', 'pending_review', 'manual_review'].includes(
        normalized,
      )
    ) {
      return KycStatus.NEEDS_REVIEW;
    }

    if (['in_progress', 'processing', 'pending'].includes(normalized)) {
      return KycStatus.IN_PROGRESS;
    }

    return KycStatus.NEEDS_REVIEW;
  }

  private extractStatus(payload: Record<string, unknown>): string | undefined {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const candidates = [
      data.status,
      data.verificationStatus,
      data.kycStatus,
      payload.event,
      payload.status,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return undefined;
  }

  private resolveUserId(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const subjectRef = data.subjectRef ?? data.subject_ref;
    if (typeof subjectRef === 'string' && subjectRef.length > 0) {
      return subjectRef;
    }

    const reference = data.reference ?? payload.reference;
    if (typeof reference === 'string') {
      const match = reference.match(
        /^beautician-kyc-([0-9a-f-]{36})-\d+$/i,
      );
      if (match) return match[1];
    }

    return null;
  }

  private extractSessionId(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const sessionId = data.sessionId ?? data.session_id;
    return typeof sessionId === 'string' ? sessionId : null;
  }

  private extractCustomerId(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const id =
      data.customerId ??
      data.customer_id ??
      data.qoreIdCustomerId ??
      data.flowRequestId;

    return id != null ? String(id) : null;
  }

  private async requireProfile(profileId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');
    return profile;
  }
}