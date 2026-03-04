import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateInfluencerDto {
  @ApiPropertyOptional({
    description: 'Full name of the influencer',
    example: 'Jane Okafor',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Phone number (Nigerian format)',
    example: '08012345678',
  })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  @IsString()
  @Matches(/^(\+?234|0)[789]\d{9}$/, {
    message: 'Phone must be a valid Nigerian number',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Email address',
    example: 'jane@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Internal admin notes',
    example: 'Instagram: @janeokafor',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Activate or deactivate the influencer',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
