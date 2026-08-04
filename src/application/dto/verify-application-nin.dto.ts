import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

const toTrimmedString = (value: unknown): unknown =>
    typeof value === 'string' ? value.trim() : value;

export class VerifyApplicationNinDto {
    @ApiProperty({ example: '63184876213' })
    @IsString()
    @Matches(/^\d{11}$/, { message: 'nin must be exactly 11 digits' })
    nin: string;

    @ApiProperty({ example: 'Bunch' })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => toTrimmedString(value))
    firstName: string;

    @ApiProperty({ example: 'Dillon' })
    @IsString()
    @IsNotEmpty()
    @Transform(({ value }) => toTrimmedString(value))
    lastName: string;
}