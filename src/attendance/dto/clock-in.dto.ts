import { IsNumber, IsLatitude, IsLongitude } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClockInDto {
    @ApiProperty({ example: 6.5244 })
    @IsLatitude()
    lat: number;

    @ApiProperty({ example: 3.3792 })
    @IsLongitude()
    lng: number;
}