import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsDateString,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';

export class SalonBookingServiceLineDto {
    @ApiProperty()
    @IsUUID()
    serviceId: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;
}

export class SalonBookingInventoryLineDto {
    @ApiProperty()
    @IsUUID()
    itemId: string;

    @ApiProperty()
    @IsInt()
    @Min(1)
    quantity: number;
}

export class CreateSalonBookingDto {
    @ApiPropertyOptional({ description: 'Required for Admin-created bookings; auto-set to the caller\'s own branch for staff-created ones.' })
    @IsOptional()
    @IsUUID()
    branchId?: string;

    @ApiProperty({ example: 'Ngozi Adeyemi' })
    @IsString()
    customerName: string;

    @ApiPropertyOptional({ example: '+2348012345678' })
    @IsOptional()
    @IsString()
    customerPhone?: string;

    @ApiProperty({ description: 'The Stylist/staff member providing the service' })
    @IsUUID()
    assignedStaffId: string;

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

    @ApiPropertyOptional({
        type: [SalonBookingInventoryLineDto],
        description: 'Products used or sold as part of this booking — optional, can also be added later before completion.',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SalonBookingInventoryLineDto)
    inventoryItems?: SalonBookingInventoryLineDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}