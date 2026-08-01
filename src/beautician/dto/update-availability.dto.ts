import { ApiProperty } from '@nestjs/swagger';
import { AvailabilityStatus } from '@prisma/client';
import { IsIn } from 'class-validator';

const AVAILABILITY_TOGGLE_STATUSES = [
  AvailabilityStatus.ONLINE,
  AvailabilityStatus.OFFLINE,
] as const;

export class UpdateAvailabilityDto {
  @ApiProperty({
    enum: AVAILABILITY_TOGGLE_STATUSES,
    description: 'Set beautician availability to ONLINE or OFFLINE',
  })
  @IsIn(AVAILABILITY_TOGGLE_STATUSES)
  status: (typeof AVAILABILITY_TOGGLE_STATUSES)[number];
}