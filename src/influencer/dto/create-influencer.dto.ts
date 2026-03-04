import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class CreateInfluencerDto {
  @ApiProperty({
    description: 'Full name of the influencer',
    example: 'Jane Okafor',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Phone number (Nigerian format)',
    example: '08012345678',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?234|0)[789]\d{9}$/, {
    message:
      'Phone must be a valid Nigerian number (e.g. 08012345678 or +2348012345678)',
  })
  phone: string;

  @ApiPropertyOptional({
    description: 'Email address of the influencer',
    example: 'jane@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Internal admin notes (not shown to customers)',
    example: 'Instagram: @janeokafor — 50k followers',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Whether the influencer is active (default: true)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
