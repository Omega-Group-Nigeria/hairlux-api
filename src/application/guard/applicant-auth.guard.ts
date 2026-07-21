import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApplicantAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing applicant token');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      if (payload.purpose !== 'applicant' || !payload.applicationId) {
        throw new UnauthorizedException('Invalid applicant token');
      }

      request.applicationId = payload.applicationId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired applicant token');
    }
  }
}