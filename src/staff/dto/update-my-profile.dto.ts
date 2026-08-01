import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

const toTrimmedString = (value: unknown): unknown =>
    typeof value === 'string' ? value.trim() : value;

export class UpdateMyProfileDto {
    @ApiPropertyOptional({ example: '+2348012345678' })
    @IsOptional()
    @IsString()
    @Transform(({ value }) => toTrimmedString(value))
    phone?: string;
}