import { ApiProperty } from '@nestjs/swagger';
import { FcmPlatform } from '@prisma/client';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class RegisterFcmTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  token: string;

  @ApiProperty({ enum: FcmPlatform })
  @IsEnum(FcmPlatform)
  platform: FcmPlatform;
}