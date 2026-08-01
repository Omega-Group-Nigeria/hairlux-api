import { Injectable, Logger } from '@nestjs/common';
import { PushDispatchService } from '../push/push-dispatch.service';
import { PUSH_EVENTS } from '../push/push-event.types';

export type KycPushOutcome = 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW';
export type ProfileReviewPushOutcome = 'APPROVED' | 'REJECTED' | 'VIDEO_ONLY';

/**
 * Beautician onboarding critical pushes (SRP).
 * Emails stay on BeauticianNotificationService.
 * Not v1: profile submitted.
 */
@Injectable()
export class OnboardingPushNotifier {
  private readonly logger = new Logger(OnboardingPushNotifier.name);

  constructor(private readonly dispatch: PushDispatchService) {}

  notifyKycResult(input: {
    beauticianUserId: string;
    outcome: KycPushOutcome;
    reason?: string | null;
  }): void {
    const outcomeLabel = this.kycOutcomeLabel(input.outcome);
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.ONBOARDING_KYC_RESULT,
        { outcomeLabel },
        {
          outcome: input.outcome,
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        },
      )
      .catch((err) => this.logErr('kyc_result', err));
  }

  notifyProfileReview(input: {
    beauticianUserId: string;
    outcome: ProfileReviewPushOutcome;
    notes?: string | null;
  }): void {
    const outcomeLabel = this.profileOutcomeLabel(input.outcome);
    void this.dispatch
      .sendEvent(
        input.beauticianUserId,
        PUSH_EVENTS.ONBOARDING_PROFILE_REVIEW,
        { outcomeLabel },
        {
          outcome: input.outcome,
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        },
      )
      .catch((err) => this.logErr('profile_review', err));
  }

  private kycOutcomeLabel(outcome: KycPushOutcome): string {
    switch (outcome) {
      case 'VERIFIED':
        return 'verified';
      case 'REJECTED':
        return 'rejected';
      case 'NEEDS_REVIEW':
        return 'needs review';
      default:
        return String(outcome).replace(/_/g, ' ').toLowerCase();
    }
  }

  private profileOutcomeLabel(outcome: ProfileReviewPushOutcome): string {
    switch (outcome) {
      case 'APPROVED':
        return 'approved';
      case 'REJECTED':
        return 'rejected';
      case 'VIDEO_ONLY':
        return 'not accepted for the intro video — please re-upload';
      default:
        return String(outcome).replace(/_/g, ' ').toLowerCase();
    }
  }

  private logErr(label: string, err: unknown) {
    this.logger.warn(
      `onboarding push ${label}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
