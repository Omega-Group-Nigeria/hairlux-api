import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateBeauticianDispatchDto {
  @ApiProperty({
    description:
      'When true, beautician is excluded from dispatch matching and removed from geo index',
  })
  @IsBoolean()
  suspended: boolean;
}