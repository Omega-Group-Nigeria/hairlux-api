import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateDirectiveStatusDto {
  @ApiProperty({
    enum: ['ACKNOWLEDGED', 'COMPLETED'],
    example: 'ACKNOWLEDGED',
    description: 'Staff can only move a directive forward -- never back to PENDING.',
  })
  @IsIn(['ACKNOWLEDGED', 'COMPLETED'])
  status: 'ACKNOWLEDGED' | 'COMPLETED';
}