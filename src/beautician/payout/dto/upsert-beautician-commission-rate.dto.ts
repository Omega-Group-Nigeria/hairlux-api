import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertBeauticianCommissionRateDto {
  @ApiProperty({
    description:
      "Beautician commission rate for all of this beautician's home-service jobs (0–1). Example: 0.6 = 60%.",
    example: 0.6,
    minimum: 0,
    maximum: 1,
  })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate: number;
}
