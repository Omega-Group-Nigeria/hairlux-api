import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class KycVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: user.id },
      select: { kycStatus: true },
    });

    if (!profile || profile.kycStatus !== KycStatus.VERIFIED) {
      throw new ForbiddenException(
        'KYC verification must be completed before this action',
      );
    }

    return true;
  }
}