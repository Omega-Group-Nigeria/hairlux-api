import { Injectable } from '@nestjs/common';
import { MailService } from '../../../mail/mail.service';

interface BeauticianUserContact {
  id?: string;
  email: string;
  firstName: string;
  lastName?: string;
}

/**
 * Beautician email notifications.
 * Critical FCM for onboarding/jobs lives on domain notifiers under src/notifications.
 */
@Injectable()
export class BeauticianNotificationService {
  constructor(private readonly mailService: MailService) {}

  /** Email only — push is OnboardingPushNotifier (`onboarding.kyc_result`). */
  async notifyKycResult(
    user: BeauticianUserContact,
    outcome: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW',
    reason?: string,
  ) {
    await this.mailService.sendBeauticianKycResultEmail(
      user.email,
      user.firstName,
      outcome,
      reason,
    );
  }

  /**
   * Email only — profile submitted is not a critical v1 push (plan §3.5).
   */
  async notifyProfileSubmitted(user: BeauticianUserContact) {
    await this.mailService.sendBeauticianProfileReviewEmail(
      user.email,
      user.firstName,
      'SUBMITTED',
    );
  }

  /**
   * Email only — push is OnboardingPushNotifier (`onboarding.profile_review`).
   */
  async notifyProfileReviewResult(
    user: BeauticianUserContact,
    outcome: 'APPROVED' | 'REJECTED' | 'VIDEO_ONLY',
    notes?: string,
  ) {
    await this.mailService.sendBeauticianProfileReviewEmail(
      user.email,
      user.firstName,
      outcome,
      notes,
    );
  }

  /** Email only — job offer FCM is JobPushNotifier (`job.offer`). */
  async notifyNewJobOffer(
    user: BeauticianUserContact,
    bookingId: string,
    estEarnings: number,
  ) {
    await this.mailService.sendBeauticianJobOfferEmail(
      user.email,
      user.firstName,
      bookingId,
      estEarnings,
    );
  }

  /**
   * Email only — customer also gets BookingPushNotifier `booking.arrived`.
   */
  async notifyArrivalVerificationNeeded(
    user: BeauticianUserContact,
    bookingId: string,
  ) {
    await this.mailService.sendArrivalVerificationNeededEmail(
      user.email,
      user.firstName,
      bookingId,
    );
  }

  /**
   * @deprecated Prefer JobPushNotifier.notifyArrivalVerified.
   */
  async notifyArrivalVerified(
    _user: BeauticianUserContact,
    _bookingId: string,
  ) {
    // Push moved to JobPushNotifier.
  }

  /**
   * @deprecated Prefer JobPushNotifier.notifyCompletionRequested.
   */
  async notifyServiceAwaitingConfirmation(
    _user: BeauticianUserContact,
    _bookingId: string,
  ) {
    // Push moved to JobPushNotifier.
  }

  /** Email only — job completed FCM is JobPushNotifier (`job.completed`). */
  async notifyServiceCompleted(
    user: BeauticianUserContact,
    bookingId: string,
    rating: number,
  ) {
    await this.mailService.sendServiceCompletedEmail(
      user.email,
      user.firstName,
      bookingId,
      rating,
    );
  }
}
