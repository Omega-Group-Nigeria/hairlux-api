import { InjectQueue } from '@nestjs/bull';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Queue } from 'bull';
import { EmailJobData } from './mail.processor';
import {
  applicationConfirmationTemplate,
  ApplicationStatusUpdateData,
  applicationStatusUpdateTemplate,
  beauticianDispatchSuspensionTemplate,
  beauticianKycResultTemplate,
  beauticianProfileReviewTemplate,
  bookingConfirmationTemplate,
  contactFormSubmissionTemplate,
  depositSuccessTemplate,
  guestBookingNotificationTemplate,
  InterviewScheduledData,
  interviewScheduledTemplate,
  OfferDeclinedData,
  offerDeclinedTemplate,
  OfferExtendedData,
  offerExtendedTemplate,
  lowStockAlertTemplate,
  LowStockAlertData,
  otpTemplate,
  referralRewardTemplate,
  resetPasswordTemplate,
  serviceCompletedTemplate,
  shopOrderConfirmationTemplate,
  staffBirthdayTemplate
} from './templates';
import type { ApplicationConfirmationData } from './templates/application-confirmation.template';
import type { DispatchSuspensionEmailData } from './templates/beautician-dispatch-suspension.template';
import type { ShopOrderConfirmationData } from './templates/shop-order-confirmation.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectQueue('email') private emailQueue: Queue<EmailJobData>,
    private configService: ConfigService,
  ) { }

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

      const [baseWithoutQuery, existingQuery = ''] = normalizedBase.split('?');
      const resetPageBase = baseWithoutQuery.endsWith('/reset-password.html')
        ? baseWithoutQuery
        : `${baseWithoutQuery}/reset-password.html`;
      const queryParams = new URLSearchParams(existingQuery);
      queryParams.set('token', resetToken);
      const resetUrl = `${resetPageBase}?${queryParams.toString()}`;

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
      isHomeService?: boolean;
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
      throw error;
    }
  }

  async sendShopOrderConfirmationEmail(
    email: string,
    firstName: string,
    order: ShopOrderConfirmationData,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Shop Order Confirmed [${order.orderCode}] — HairLux`,
          html: shopOrderConfirmationTemplate(firstName, order),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Shop order confirmation email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error queuing shop order confirmation email:`,
        errorMessage,
      );
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

  async sendBeauticianKycResultEmail(
    email: string,
    firstName: string,
    outcome: 'VERIFIED' | 'REJECTED' | 'NEEDS_REVIEW',
    reason?: string,
  ) {
    try {
      const subject =
        outcome === 'VERIFIED'
          ? 'KYC Verified — HairLux Beautician'
          : outcome === 'REJECTED'
            ? 'KYC Not Approved — HairLux Beautician'
            : 'KYC Under Review — HairLux Beautician';

      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject,
          html: beauticianKycResultTemplate(firstName, outcome, reason),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (error) {
      this.logger.error(
        `Error queuing beautician KYC email: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async sendBeauticianProfileReviewEmail(
    email: string,
    firstName: string,
    outcome: 'APPROVED' | 'REJECTED' | 'SUBMITTED' | 'VIDEO_ONLY',
    notes?: string,
  ) {
    try {
      const subject =
        outcome === 'APPROVED'
          ? 'Profile Approved — HairLux Beautician'
          : outcome === 'REJECTED'
            ? 'Profile Not Approved — HairLux Beautician'
            : outcome === 'VIDEO_ONLY'
              ? 'Intro Video Re-upload Required — HairLux Beautician'
              : 'Profile Submitted — HairLux Beautician';

      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject,
          html: beauticianProfileReviewTemplate(firstName, outcome, notes),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (error) {
      this.logger.error(
        `Error queuing beautician profile review email: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async sendBeauticianDispatchSuspensionEmail(
    email: string,
    data: Omit<DispatchSuspensionEmailData, 'firstName'> & {
      firstName: string;
    },
  ) {
    try {
      const subject =
        data.kind === 'SUSPENDED'
          ? 'Dispatch Access Suspended — HairLux Beautician'
          : 'Dispatch Access Restored — HairLux Beautician';

      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject,
          html: beauticianDispatchSuspensionTemplate(data),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (error) {
      this.logger.error(
        `Error queuing beautician dispatch suspension email: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async sendServiceCompletedEmail(
    email: string,
    firstName: string,
    bookingId: string,
    rating: number,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: 'Service Completed — HairLux',
          html: serviceCompletedTemplate(firstName, bookingId, rating),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (error) {
      this.logger.error(
        `Error queuing service completed email: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async sendApplicationConfirmationEmail(
    email: string,
    firstName: string,
    data: ApplicationConfirmationData,) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Application Received [${data.applicationCode}] — HairLux`,
          html: applicationConfirmationTemplate(firstName, data),
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );

      this.logger.log(`Application confirmation email queued for ${email}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error queuing application confirmation email:`,
        errorMessage,
      );
    }
  }
  async sendApplicationOtpEmail(
    email: string,
    firstName: string,
    data: ApplicationConfirmationData,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Your Login Code — HairLux Applicant Portal`,
          html: applicationConfirmationTemplate(firstName, data),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );

      this.logger.log(`Application OTP email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing application OTP email:`, errorMessage);
    }
  }

  async sendApplicationStatusUpdateEmail(
    email: string,
    firstName: string,
    status: 'SHORTLISTED' | 'OFFER_EXTENDED' | 'NOT_SELECTED',
    data: ApplicationStatusUpdateData,
  ) {
    try {
      await this.emailQueue.add('send', {
        to: email,
        subject: `Application Update [${data.applicationCode}] — HairLux`,
        html: applicationStatusUpdateTemplate(firstName, status, data),
      }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
      this.logger.log(`Application status update (${status}) email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing application status update email:`, errorMessage);
    }
  }

  async sendInterviewScheduledEmail(email: string, firstName: string, data: InterviewScheduledData) {
    try {
      await this.emailQueue.add('send', {
        to: email,
        subject: `Interview Scheduled [${data.applicationCode}] — HairLux`,
        html: interviewScheduledTemplate(firstName, data),
      }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
      this.logger.log(`Interview scheduled email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing interview scheduled email:`, errorMessage);
    }
  }

  async sendOfferExtendedEmail(
    email: string,
    firstName: string,
    data: OfferExtendedData,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `You Have an Offer — ${data.applicationCode} — HairLux`,
          html: offerExtendedTemplate(firstName, data),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );

      this.logger.log(`Offer-extended email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing offer-extended email:`, errorMessage);
    }
  }

  async sendOfferDeclinedEmail(
    email: string,
    firstName: string,
    data: OfferDeclinedData,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Offer Declined — ${data.applicationCode} — HairLux`,
          html: offerDeclinedTemplate(firstName, data),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );

      this.logger.log(`Offer-declined email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing offer-declined email:`, errorMessage);
    }
  }

  async sendLowStockAlertEmail(
    email: string,
    firstName: string,
    data: LowStockAlertData,
  ) {
    try {
      await this.emailQueue.add(
        'send',
        {
          to: email,
          subject: `Low Stock Alert [${data.stage}] — ${data.itemName} — HairLux`,
          html: lowStockAlertTemplate(firstName, data),
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
      this.logger.log(`Low-stock alert email queued for ${email}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error queuing low-stock alert email:`, errorMessage);
    }
  }
}
