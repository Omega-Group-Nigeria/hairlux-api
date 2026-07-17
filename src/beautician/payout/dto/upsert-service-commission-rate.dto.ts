import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertServiceCommissionRateDto {
  @ApiProperty({
    description:
      'Beautician commission rate for this service (0–1). Example: 0.05 = 5%.',
    example: 0.05,
    minimum: 0,
    maximum: 1,
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate: number;
}
