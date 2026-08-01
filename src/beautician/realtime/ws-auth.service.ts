import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';
import { JwtPayload } from '../../auth/types/jwt-payload.interface';

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async authenticate(token?: string) {
    if (!token?.trim()) {
      throw new UnauthorizedException('WebSocket authentication token required');
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET') || 'default-secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid WebSocket authentication token');
    }

    return this.authService.validateUser(payload.sub, payload.sessionId);
  }
}