import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ServiceStatus } from '@prisma/client';

export class UpdateServiceStatusDto {
  @ApiProperty({
    description: 'Service status',
    enum: ServiceStatus,
    example: 'ACTIVE',
  })
  @IsNotEmpty()
  @IsEnum(ServiceStatus)
  status: ServiceStatus;
}
