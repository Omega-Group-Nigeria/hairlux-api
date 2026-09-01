import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RequestPhoneVerificationDto {
    @ApiProperty({ example: '+2348012345678', description: 'Phone number to verify — must be unique across all accounts.' })
    @IsNotEmpty()
    @Transform(({ value }) => value?.trim())
    @IsString()
    @Matches(/^\+?[0-9\s\-()]{7,20}$/, { message: 'Invalid phone number format' })
    phone: string;
}