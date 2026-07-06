import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamClient } from '@stream-io/node-sdk';

@Injectable()
export class StreamVideoClientService {
  private readonly logger = new Logger(StreamVideoClientService.name);
  private client: StreamClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('STREAM_API_KEY') &&
        this.configService.get<string>('STREAM_API_SECRET'),
    );
  }

  getClient(): StreamClient {
    if (!this.isConfigured()) {
      throw new Error(
        'Stream Video is not configured. Set STREAM_API_KEY and STREAM_API_SECRET.',
      );
    }

    if (!this.client) {
      const apiKey = this.configService.get<string>('STREAM_API_KEY')!;
      const apiSecret = this.configService.get<string>('STREAM_API_SECRET')!;
      this.client = new StreamClient(apiKey, apiSecret);
      this.logger.log('Stream Video server client initialized');
    }

    return this.client;
  }

  getWebhookSecret(): string | null {
    return (
      this.configService.get<string>('STREAM_WEBHOOK_SECRET') ||
      this.configService.get<string>('STREAM_API_SECRET') ||
      null
    );
  }

  verifyAndParseWebhook(rawBody: string | Buffer, signature: string) {
    const secret = this.getWebhookSecret();
    if (!secret) {
      throw new Error('Stream webhook secret is not configured');
    }

    return this.getClient().verifyAndParseWebhook(rawBody, signature);
  }
}