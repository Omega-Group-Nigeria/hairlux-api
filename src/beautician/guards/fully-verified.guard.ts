import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { KycStatus, ProfileReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FullyVerifiedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();

    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { userId: user.id },
      select: { kycStatus: true, profileStatus: true, isActive: true },
    });

    const isFullyVerified =
      profile?.isActive &&
      profile.kycStatus === KycStatus.VERIFIED &&
      profile.profileStatus === ProfileReviewStatus.APPROVED;

    if (!isFullyVerified) {
      throw new ForbiddenException(
        'Full verification (KYC + profile approval) is required for this action',
      );
    }

    return true;
  }
}