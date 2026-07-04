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

type ParsedMailbox = {
  address: string;
  name?: string;
};

@Processor('email')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);
  private readonly zeptoMailToken?: string;
  private readonly zeptoMailApiUrl: string;
  private readonly emailFrom: ParsedMailbox;
  private transporter?: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.zeptoMailToken = normalizeZeptoMailToken(
      this.configService.get<string>('ZEPTOMAIL_SEND_MAIL_TOKEN'),
    );
    this.zeptoMailApiUrl =
      this.configService.get<string>('ZEPTOMAIL_API_URL')?.trim() ||
      'https://api.zeptomail.com/v1.1/email';
    this.emailFrom = parseMailbox(
      this.configService.get<string>('EMAIL_FROM') ||
        'HairLux <noreply@hairlux.com.ng>',
    );

    if (this.zeptoMailToken) {
      const agentAlias = this.configService.get<string>('ZEPTOMAIL_AGENT_ALIAS');
      this.logger.log(
        `Mail transport configured: ZeptoMail API${agentAlias ? ` (${agentAlias})` : ''}`,
      );
      return;
    }

    const smtpHost = this.configService.get<string>('SMTP_HOST')?.trim();
    if (!smtpHost) {
      this.logger.warn(
        'ZEPTOMAIL_SEND_MAIL_TOKEN is not configured and SMTP_HOST is empty. Email sending is disabled.',
      );
      return;
    }

    this.logger.warn(
      'ZEPTOMAIL_SEND_MAIL_TOKEN is not configured. Falling back to SMTP transport.',
    );
    this.transporter = nodemailer.createTransport({
      host: smtpHost,
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

      if (this.zeptoMailToken) {
        await this.sendViaZeptoMailApi({ to, subject, html });
      } else if (this.transporter) {
        await this.transporter.sendMail({
          from: formatMailbox(this.emailFrom),
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
      throw error;
    }
  }

  private async sendViaZeptoMailApi(data: EmailJobData): Promise<void> {
    const recipient = parseMailbox(data.to);

    try {
      await axios.post(
        this.zeptoMailApiUrl,
        {
          from: {
            address: this.emailFrom.address,
            ...(this.emailFrom.name ? { name: this.emailFrom.name } : {}),
          },
          to: [
            {
              email_address: {
                address: recipient.address,
                ...(recipient.name ? { name: recipient.name } : {}),
              },
            },
          ],
          subject: data.subject,
          htmlbody: data.html,
        },
        {
          headers: {
            Authorization: `Zoho-enczapikey ${this.zeptoMailToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseData = error.response?.data;
        const responseMessage = extractZeptoMailErrorMessage(responseData);

        throw new Error(
          responseMessage
            ? `ZeptoMail API error: ${responseMessage}`
            : `ZeptoMail API request failed: ${error.message}`,
        );
      }

      throw error;
    }
  }
}

function normalizeZeptoMailToken(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/^zoho-enczapikey\s+/i, '').trim() || undefined;
}

function parseMailbox(value: string): ParsedMailbox {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/);

  if (match) {
    return {
      name: match[1].trim(),
      address: match[2].trim(),
    };
  }

  return { address: trimmed };
}

function formatMailbox(mailbox: ParsedMailbox): string {
  return mailbox.name
    ? `${mailbox.name} <${mailbox.address}>`
    : mailbox.address;
}

function extractZeptoMailErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.message === 'string') {
    return record.message;
  }

  const error = record.error;
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;
  if (typeof errorRecord.message === 'string') {
    return errorRecord.message;
  }

  const details = errorRecord.details;
  if (!Array.isArray(details) || !details.length) {
    return undefined;
  }

  const firstDetail = details[0];
  if (!firstDetail || typeof firstDetail !== 'object') {
    return undefined;
  }

  const detailMessage = (firstDetail as Record<string, unknown>).message;
  return typeof detailMessage === 'string' ? detailMessage : undefined;
}