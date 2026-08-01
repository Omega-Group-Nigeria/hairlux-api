import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class VerifyArrivalDto {
  @ApiPropertyOptional({ example: '482910' })
  @IsOptional()
  @IsString()
  @Length(4, 6)
  @Matches(/^\d+$/)
  pin?: string;

  @ApiPropertyOptional({
    description: 'Signed QR token from beautician verification screen',
  })
  @IsOptional()
  @IsString()
  qrToken?: string;
}