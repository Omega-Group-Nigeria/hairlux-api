import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class RequestOtpDto {
  @ApiProperty({ example: 'HL-APP-2026-004821' })
  @IsString()
  @IsNotEmpty()
  applicationCode: string;

  @ApiProperty({ example: 'applicant@email.com' })
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}