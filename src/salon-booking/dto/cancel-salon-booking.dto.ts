import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CancelSalonBookingDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    reason: string;
}