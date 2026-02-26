import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'New user status',
    enum: UserStatus,
    example: 'ACTIVE',
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}
