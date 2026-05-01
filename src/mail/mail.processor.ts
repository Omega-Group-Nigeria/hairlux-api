import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
}

@Processor('email')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly resendApiKey?: string;
  private readonly emailFrom: string;
  private transporter?: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.resendApiKey = this.configService
      .get<string>('RESEND_API_KEY')
      ?.trim();
    this.emailFrom =
      this.configService.get<string>('EMAIL_FROM') ||
      'HairLux <noreply@hairlux.com.ng>';

    if (this.resendApiKey) {
      this.logger.log('Mail transport configured: Resend API');
      return;
    }

    this.logger.warn(
      'RESEND_API_KEY is not configured. Falling back to SMTP transport.',
    );
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT'),
      secure: false,
      requireTLS: true,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  @Process('send')
  async handleSendEmail(job: Job<EmailJobData>) {
    const { to, subject, html } = job.data;

    try {
      this.logger.log(`Sending email to ${to} with subject: ${subject}`);

      if (this.resendApiKey) {
        await this.sendViaResendApi({ to, subject, html });
      } else if (this.transporter) {
        await this.transporter.sendMail({
          from: this.emailFrom,
          to,
          subject,
          html,
        });
      } else {
        throw new Error('No mail transport is configured');
      }

      this.logger.log(`Email sent successfully to ${to}`);
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email to ${to}:`, errorMessage);
      throw error; // Bull will retry based on job configuration
    }
  }

  private async sendViaResendApi(data: EmailJobData): Promise<void> {
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from: this.emailFrom,
          to: [data.to],
          subject: data.subject,
          html: data.html,
        },
        {
          headers: {
            Authorization: `Bearer ${this.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseMessage =
          typeof error.response?.data === 'object' &&
          error.response?.data &&
          'message' in error.response.data
            ? String((error.response.data as { message?: unknown }).message)
            : undefined;

        throw new Error(
          responseMessage
            ? `Resend API error: ${responseMessage}`
            : `Resend API request failed: ${error.message}`,
        );
      }

      throw error;
    }
  }
}
