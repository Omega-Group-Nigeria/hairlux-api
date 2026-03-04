import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayUnique } from 'class-validator';
import { ALL_PERMISSION_VALUES } from '../../common/constants/permissions';

export class SetRolePermissionsDto {
  @ApiProperty({
    description:
      'Complete set of permissions to assign to this role. This REPLACES the current set — send an empty array to remove all.',
    example: ['bookings:read', 'bookings:update_status', 'users:read'],
    type: [String],
    enum: ALL_PERMISSION_VALUES,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  permissions: string[];
}
