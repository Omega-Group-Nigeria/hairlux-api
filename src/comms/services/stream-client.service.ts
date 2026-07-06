import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StreamChat } from 'stream-chat';

@Injectable()
export class StreamClientService {
  private readonly logger = new Logger(StreamClientService.name);
  private client: StreamChat | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('STREAM_API_KEY') &&
        this.configService.get<string>('STREAM_API_SECRET'),
    );
  }

  getClient(): StreamChat {
    if (!this.isConfigured()) {
      throw new Error(
        'Stream Chat is not configured. Set STREAM_API_KEY and STREAM_API_SECRET.',
      );
    }

    if (!this.client) {
      const apiKey = this.configService.get<string>('STREAM_API_KEY')!;
      const apiSecret = this.configService.get<string>('STREAM_API_SECRET')!;
      this.client = StreamChat.getInstance(apiKey, apiSecret);
      this.logger.log('Stream Chat server client initialized');
    }

    return this.client;
  }
}