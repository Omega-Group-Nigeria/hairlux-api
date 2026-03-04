import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignAdminRoleDto {
  @ApiProperty({
    description: 'ID of the AdminRole to assign',
    example: 'b2f7e1a0-3c14-4f2b-9e8d-1a2b3c4d5e6f',
  })
  @IsUUID()
  adminRoleId: string;
}
