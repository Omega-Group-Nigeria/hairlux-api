import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RequestPayoutDto {
  @ApiProperty({ example: 15000, minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    example: '058',
    description: 'Optional when a verified payout bank account is already saved',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string;

  @ApiPropertyOptional({
    example: '0123456789',
    description: 'Optional when a verified payout bank account is already saved',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'Ada Okafor' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName?: string;
}