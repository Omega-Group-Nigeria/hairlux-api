import { Injectable } from '@nestjs/common';
import { MailService } from '../../../mail/mail.service';
import { PushNotificationService } from '../../fcm/push-notification.service';

interface BeauticianUserContact {
  id?: string;
  email: string;
  firstName: string;
  lastName?: string;
}

@Injectable()
export class BeauticianNotificationService {
  constructor(
    private readonly mailService: MailService,
    private readonly pushService: PushNotificationService,
  ) {}

  private async push(
    user: BeauticianUserContact,
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!user.id) return;
    void this.pushService.sendToUser(user.id, { title, body, data });
  }

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
    await this.push(
      user,
      'KYC update',
      `Your identity verification status is ${outcome.replace('_', ' ').toLowerCase()}.`,
      { type: 'kyc_result', outcome },
    );
  }

  async notifyProfileSubmitted(user: BeauticianUserContact) {
    await this.mailService.sendBeauticianProfileReviewEmail(
      user.email,
      user.firstName,
      'SUBMITTED',
    );
    await this.push(
      user,
      'Profile submitted',
      'Your professional profile is under review.',
      { type: 'profile_submitted' },
    );
  }

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

    if (outcome === 'VIDEO_ONLY') {
      await this.push(
        user,
        'Video re-upload required',
        'Your intro video was not accepted. Please record and submit a new video.',
        { type: 'profile_review', outcome },
      );
      return;
    }

    await this.push(
      user,
      'Profile review',
      `Your profile was ${outcome.toLowerCase()}.`,
      { type: 'profile_review', outcome },
    );
  }

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
    await this.push(
      user,
      'New job offer',
      `You have a new home-service job. Est. earnings ₦${estEarnings.toLocaleString()}.`,
      { type: 'job_offer', bookingId },
    );
  }

  async notifyArrivalVerificationNeeded(
    user: BeauticianUserContact,
    bookingId: string,
  ) {
    await this.mailService.sendArrivalVerificationNeededEmail(
      user.email,
      user.firstName,
      bookingId,
    );
    await this.push(
      user,
      'Verify arrival',
      'Your beautician has arrived — please verify their PIN.',
      { type: 'arrival_verify', bookingId },
    );
  }

  async notifyArrivalVerified(
    user: BeauticianUserContact,
    bookingId: string,
  ) {
    await this.push(
      user,
      'Arrival confirmed',
      'The customer verified your arrival. You can start the service.',
      { type: 'arrival_verified', bookingId },
    );
  }

  async notifyServiceAwaitingConfirmation(
    user: BeauticianUserContact,
    bookingId: string,
  ) {
    await this.push(
      user,
      'Service complete',
      'Please confirm service completion.',
      { type: 'awaiting_confirmation', bookingId },
    );
  }

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
    await this.push(
      user,
      'Job completed',
      `Booking completed. Customer rating: ${rating}/5.`,
      { type: 'service_completed', bookingId },
    );
  }
}