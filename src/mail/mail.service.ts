import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { UserRole } from '@prisma/client';
import { EmailJobData } from './mail.processor';
import { ConfigService } from '@nestjs/config';
import {
  otpTemplate,
  resetPasswordTemplate,
  bookingConfirmationTemplate,
  guestBookingNotificationTemplate,
  depositSuccessTemplate,
  referralRewardTemplate,
  staffBirthdayTemplate,
  contactFormSubmissionTemplate,
} from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue('email') private emailQueue: Queue<EmailJobData>,
    private configService: ConfigService,
  ) {}

  async sendOtpEmail(email: string, otpCode: string, firstName: string) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'Verify Your Email — HairLux',
          html: otpTemplate(firstName, otpCode),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`OTP email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing OTP email:`, errorMessage);
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    firstName: string,
    role: UserRole,
  ) {
    try {
      const frontendUrl =
        this.configService.get<string>('FRONTEND_URL') ||
        'http://localhost:3001';
      const adminUrl =
        this.configService.get<string>('ADMIN_URL') || frontendUrl;

      const baseUrl = role === UserRole.USER ? frontendUrl : adminUrl;
      const normalizedBase = baseUrl.endsWith('/')
        ? baseUrl.slice(0, -1)
        : baseUrl;

      const resetUrl =
        role === UserRole.USER
          ? `${normalizedBase}/reset-password.html?token=${encodeURIComponent(resetToken)}`
          : `${normalizedBase}${normalizedBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(resetToken)}`;

      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'Reset Your Password — HairLux',
          html: resetPasswordTemplate(firstName, resetUrl),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Password reset email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing password reset email:`, errorMessage);
    }
  }

  async sendDepositSuccessEmail(
    email: string,
    firstName: string,
    deposit: {
      amount: number;
      reference: string;
      newBalance: number;
      date: string;
    },
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'Deposit Successful — HairLux',
          html: depositSuccessTemplate(firstName, deposit),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Deposit success email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing deposit success email:`, errorMessage);
    }
  }

  async sendBookingConfirmationEmail(
    email: string,
    firstName: string,
    bookingDetails: {
      services: { name: string; price: number; duration: number }[];
      date: string;
      time: string;
      address: string;
      totalAmount: number;
      paymentMethod: 'WALLET' | 'CASH' | 'MONNIFY';
      bookingIds: string[];
      reservationCode: string;
    },
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Booking Confirmed [${bookingDetails.reservationCode}] — HairLux`,
          html: bookingConfirmationTemplate(firstName, bookingDetails),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Booking confirmation email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error queuing booking confirmation email:`,
        errorMessage,
      );
    }
  }

  async sendGuestBookingEmail(
    guestEmail: string,
    guestName: string,
    data: {
      services: { name: string; price: number; duration: number }[];
      date: string;
      time: string;
      address: string;
      totalAmount: number;
      reservationCode: string;
      bookedByName: string;
    },
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: guestEmail,
          subject: `A booking was made for you [${data.reservationCode}] — HairLux`,
          html: guestBookingNotificationTemplate(guestName, data),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Guest booking notification queued for ${guestEmail}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error queuing guest booking notification email:`,
        errorMessage,
      );
    }
  }

  async sendReferralRewardEmail(
    email: string,
    firstName: string,
    reward: {
      earnedAmount: number;
      referredName: string;
      newBalance: number;
    },
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'You Earned a Referral Reward — HairLux',
          html: referralRewardTemplate(firstName, reward),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Referral reward email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing referral reward email:`, errorMessage);
    }
  }

  async sendStaffBirthdayEmail(email: string, firstName: string) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'Happy Birthday from HairLux',
          html: staffBirthdayTemplate(firstName),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Staff birthday email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing staff birthday email:`, errorMessage);
    }
  }

  async sendContactFormEmail(data: {
    name: string;
    emailAddress: string;
    phoneNo: string;
    subject: string;
    message: string;
  }) {
    const contactEmail = this.configService.get<string>('CONTACT_EMAIL');
    const safeSubject = data.subject.replace(/[\r\n]+/g, ' ').trim();

    if (!contactEmail) {
      this.logger.error('CONTACT_EMAIL is not configured');
      throw new InternalServerErrorException(
        'Contact email destination is not configured',
      );
    }

    try {
      await this.emailQueue.add(
        'send',
        {
          to: contactEmail,
          subject: `Contact Form: ${safeSubject}`,
          html: contactFormSubmissionTemplate(data),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(
        `Contact form email queued for destination ${contactEmail}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing contact form email:`, errorMessage);
      throw new InternalServerErrorException(
        'Unable to process contact request at the moment',
      );
    }
  }
}
