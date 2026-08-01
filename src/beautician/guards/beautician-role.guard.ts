import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class BeauticianRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (!user || user.role !== UserRole.BEAUTICIAN) {
      throw new ForbiddenException(
        'This resource is only available to beautician accounts',
      );
    }

    return true;
  }
}