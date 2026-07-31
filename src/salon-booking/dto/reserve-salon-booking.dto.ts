import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsOptional,
    IsString,
    IsUUID,
    ValidateNested,
} from 'class-validator';
import { SalonBookingServiceLineDto } from './create-salon-booking.dto';

export class ReserveSalonBookingDto {
    @ApiProperty({ description: 'Which branch the customer wants to visit' })
    @IsUUID()
    branchId: string;

    @ApiProperty({ example: 'Ngozi Adeyemi' })
    @IsString()
    customerName: string;

    @ApiProperty({ example: '+2348012345678', description: 'Required — used to track repeat visits and to look this reservation up later.' })
    @IsString()
    customerPhone: string;

    @ApiPropertyOptional({ example: 'ngozi@example.com' })
    @IsOptional()
    @IsString()
    customerEmail?: string;

    @ApiProperty({ example: '2026-08-01' })
    @IsDateString()
    bookingDate: string;

    @ApiProperty({ example: '14:30' })
    @IsString()
    bookingTime: string;

    @ApiProperty({ type: [SalonBookingServiceLineDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => SalonBookingServiceLineDto)
    services: SalonBookingServiceLineDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}