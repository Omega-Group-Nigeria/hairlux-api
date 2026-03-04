import { SetMetadata } from '@nestjs/common';
import type { Permission as PermissionKey } from '../../common/constants/permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to enforce fine-grained permissions on a route.
 * Use alongside @UseGuards(JwtAuthGuard, PermissionGuard).
 * SUPER_ADMIN always passes. Unlisted routes are not permission-checked.
 *
 * @example
 * @Permission('bookings:read', 'bookings:create')
 */
export const Permission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
