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
    if (!this.shouldApplyWebhookUpdate(payload)) {
      return null;
    }

    let userId = await this.resolveUserId(payload);

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

    const customerReference = this.extractCustomerReference(payload);

    const updated = await this.prisma.beauticianProfile.update({
      where: { userId },
      data: {
        kycStatus: mappedStatus,
        ...(mappedStatus === KycStatus.VERIFIED && {
          kycVerifiedAt: new Date(),
        }),
        ...(qoreIdCustomerId && { qoreIdCustomerId }),
        ...(customerReference && { qoreIdCustomerReference: customerReference }),
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
      [
        'verified',
        'success',
        'successful',
        'completed',
        'complete',
        'approved',
      ].includes(normalized)
    ) {
      const settings = await this.prisma.homeServiceSettings.findFirst();
      const autoApprove = settings?.kycAutoApprove ?? true;
      return autoApprove ? KycStatus.VERIFIED : KycStatus.NEEDS_REVIEW;
    }

    if (
      ['rejected', 'failed', 'failure', 'declined', 'unverified'].includes(
        normalized,
      )
    ) {
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

  private shouldApplyWebhookUpdate(payload: Record<string, unknown>): boolean {
    const event = payload.event;
    if (typeof event === 'string' && event !== 'workflow') {
      return false;
    }

    const eventType = payload.event_type;
    if (typeof eventType !== 'string') {
      return true;
    }

    return eventType === 'verification_completed';
  }

  private extractStatus(payload: Record<string, unknown>): string | undefined {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    if (typeof data.status === 'string' && data.status.trim()) {
      return data.status;
    }

    const nestedStatus = this.readNestedStatusValue(data.status);
    if (nestedStatus) {
      return nestedStatus;
    }

    const candidates = [
      data.verificationStatus,
      data.kycStatus,
      payload.status,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value;
      }

      const nested = this.readNestedStatusValue(value);
      if (nested) {
        return nested;
      }
    }

    return undefined;
  }

  private readNestedStatusValue(
    value: unknown,
  ): string | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    const statusObj = value as Record<string, unknown>;
    const status = statusObj.status ?? statusObj.subStatus;
    if (typeof status === 'string' && status.trim()) {
      return status;
    }

    const state = statusObj.state;
    if (typeof state === 'string' && state.trim()) {
      return state;
    }

    return undefined;
  }

  private async resolveUserId(
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const subjectRef = data.subjectRef ?? data.subject_ref;
    if (typeof subjectRef === 'string' && subjectRef.length > 0) {
      return subjectRef;
    }

    const referenceCandidates = [
      data.customerReference,
      data.customer_reference,
      data.reference,
      payload.reference,
    ];

    for (const reference of referenceCandidates) {
      const userId = this.parseBeauticianKycReference(reference);
      if (userId) {
        return userId;
      }
    }

    for (const reference of referenceCandidates) {
      if (typeof reference !== 'string' || !reference.trim()) {
        continue;
      }

      const byStoredReference = await this.prisma.beauticianProfile.findFirst({
        where: { qoreIdCustomerReference: reference },
        select: { userId: true },
      });
      if (byStoredReference?.userId) {
        return byStoredReference.userId;
      }
    }

    const qoreIdRequestId = this.extractCustomerId(payload);
    if (qoreIdRequestId) {
      const byQoreId = await this.prisma.beauticianProfile.findFirst({
        where: { qoreIdCustomerId: qoreIdRequestId },
        select: { userId: true },
      });
      if (byQoreId?.userId) {
        return byQoreId.userId;
      }
    }

    const sessionId = this.extractSessionId(payload);
    if (sessionId) {
      const bySession = await this.prisma.beauticianProfile.findFirst({
        where: { qoreIdSessionId: sessionId },
        select: { userId: true },
      });
      if (bySession?.userId) {
        return bySession.userId;
      }
    }

    return null;
  }

  private parseBeauticianKycReference(reference: unknown): string | null {
    if (typeof reference !== 'string') {
      return null;
    }

    const match = reference.match(/^beautician-kyc-([0-9a-f-]{36})-\d+$/i);
    return match ? match[1] : null;
  }

  private extractSessionId(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const sessionId = data.sessionId ?? data.session_id;
    return typeof sessionId === 'string' ? sessionId : null;
  }

  private extractCustomerReference(
    payload: Record<string, unknown>,
  ): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const reference =
      data.customerReference ??
      data.customer_reference ??
      data.reference ??
      payload.reference;

    return typeof reference === 'string' && reference.trim()
      ? reference.trim()
      : null;
  }

  private extractCustomerId(payload: Record<string, unknown>): string | null {
    const data =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;

    const id =
      data.id ??
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