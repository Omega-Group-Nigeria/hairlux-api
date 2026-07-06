import { Injectable } from '@nestjs/common';
import { STREAM_TOKEN_TTL_SECONDS } from '../constants/comms.constants';
import { StreamClientService } from './stream-client.service';

export interface MintedStreamToken {
  streamUserId: string;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class CommsTokenService {
  constructor(private readonly streamClient: StreamClientService) {}

  mintForUser(userId: string): MintedStreamToken {
    const client = this.streamClient.getClient();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAtUnix = issuedAt + STREAM_TOKEN_TTL_SECONDS;
    const token = client.createToken(userId, expiresAtUnix, issuedAt);

    return {
      streamUserId: userId,
      token,
      expiresAt: new Date(expiresAtUnix * 1000),
    };
  }
}