import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Sends SMS via Africa's Talking's REST API. Deliberately synchronous
 * (unlike MailService's BullMQ-queued sends) -- OTP delivery is time-
 * sensitive with the person waiting on it right now, so a failure needs to
 * surface immediately to the caller rather than being discovered later via
 * a queue failure the person never sees.
 */
@Injectable()
export class AfricasTalkingService {
    private readonly logger = new Logger(AfricasTalkingService.name);
    private readonly apiKey: string;
    private readonly username: string;
    private readonly senderId?: string;
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.apiKey = this.configService.get<string>('AFRICAS_TALKING_API_KEY') ?? '';
        this.username = this.configService.get<string>('AFRICAS_TALKING_USERNAME') ?? '';
        this.senderId = this.configService.get<string>('AFRICAS_TALKING_SENDER_ID');
        const env = this.configService.get<string>('AFRICAS_TALKING_ENV') ?? 'production';
        this.baseUrl = env === 'sandbox'
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';
    }

    /** Returns true on a successful send. Never throws for a delivery failure -- callers decide how to surface that (e.g. still let the OTP be requestable again). */
    async sendSms(to: string, message: string): Promise<boolean> {
        if (!this.apiKey || !this.username) {
            this.logger.error('Africa\'s Talking credentials are not configured -- cannot send SMS.');
            return false;
        }

        try {
            const params = new URLSearchParams();
            params.append('username', this.username);
            params.append('to', to);
            params.append('message', message);
            if (this.senderId) params.append('from', this.senderId);

            const response = await firstValueFrom(
                this.httpService.post(this.baseUrl, params.toString(), {
                    headers: {
                        apiKey: this.apiKey,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json',
                    },
                }),
            );

            const recipients = response.data?.SMSMessageData?.Recipients ?? [];
            const succeeded = recipients.some((r: { status?: string }) => r.status === 'Success');
            if (!succeeded) {
                this.logger.warn(`Africa's Talking did not report success for ${to}: ${JSON.stringify(recipients)}`);
            }
            return succeeded;
        } catch (err) {
            this.logger.error(`Failed to send SMS via Africa's Talking: ${err instanceof Error ? err.message : String(err)}`);
            return false;
        }
    }

    async sendOtpSms(to: string, otpCode: string): Promise<boolean> {
        return this.sendSms(to, `Your Hairlux verification code is ${otpCode}. It expires in 10 minutes.`);
    }
}