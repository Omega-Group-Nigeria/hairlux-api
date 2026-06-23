import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface ArrivalQrPayload {
  sub: string;
  pin: string;
  typ: 'arrival-verify';
}

@Injectable()
export class ArrivalQrTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  sign(bookingId: string, pin: string, expiryMinutes: number): string {
    return this.jwtService.sign(
      {
        sub: bookingId,
        pin,
        typ: 'arrival-verify',
      } satisfies ArrivalQrPayload,
      {
        secret: this.getSecret(),
        expiresIn: `${expiryMinutes}m`,
      },
    );
  }

  verify(qrToken: string): { bookingId: string; pin: string } {
    try {
      const payload = this.jwtService.verify<ArrivalQrPayload>(qrToken, {
        secret: this.getSecret(),
      });

      if (payload.typ !== 'arrival-verify' || !payload.sub || !payload.pin) {
        throw new UnauthorizedException('Invalid arrival QR token');
      }

      return {
        bookingId: payload.sub,
        pin: payload.pin,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired arrival QR token');
    }
  }

  private getSecret(): string {
    return this.configService.get<string>('JWT_SECRET') || 'default-secret';
  }
}