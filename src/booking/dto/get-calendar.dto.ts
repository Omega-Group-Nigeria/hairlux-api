import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetCalendarDto {
  @ApiProperty({
    description: 'Month (1-12)',
    example: 2,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  month: number;

  @ApiProperty({
    description: 'Year',
    example: 2026,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;
}
