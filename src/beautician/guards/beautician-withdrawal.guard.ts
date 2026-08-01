import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BeauticianWithdrawalGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user;

    if (!jwtUser?.id) {
      throw new ForbiddenException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.id },
      select: {
        id: true,
        role: true,
        beauticianProfile: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!user || user.role !== UserRole.BEAUTICIAN) {
      throw new ForbiddenException('Only beauticians can request withdrawals');
    }

    if (!user.beauticianProfile) {
      throw new ForbiddenException('Beautician profile not found');
    }

    if (!user.beauticianProfile.isActive) {
      throw new ForbiddenException(
        'Your beautician account is suspended and cannot request withdrawals',
      );
    }

    return true;
  }
}