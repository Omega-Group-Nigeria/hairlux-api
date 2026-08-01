import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      'roles',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // `user.roles` is the full multi-role list (legacy `role` + every
    // UserRoleAssignment), computed fresh on every request by
    // AuthService.validateUser(). Fall back to the single legacy `role`
    // field only if `roles` is somehow missing, so nothing breaks if this
    // guard ever runs against a `user` object that wasn't built through
    // the normal JwtStrategy path.
    const userRoles: UserRole[] = Array.isArray(user?.roles) && user.roles.length
      ? user.roles
      : [user?.role].filter(Boolean);

    const hasRequiredRole = requiredRoles.some((r) => userRoles.includes(r));

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}