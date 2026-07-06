import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CommsPublicConfig {
  streamApiKey: string | null;
  streamAppId: string | null;
}

@Injectable()
export class CommsConfigService {
  constructor(private readonly configService: ConfigService) {}

  getPublicConfig(): CommsPublicConfig {
    return {
      streamApiKey: this.configService.get<string>('STREAM_API_KEY') ?? null,
      streamAppId: this.configService.get<string>('STREAM_APP_ID') ?? null,
    };
  }

  isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('STREAM_API_KEY') &&
        this.configService.get<string>('STREAM_API_SECRET'),
    );
  }
}