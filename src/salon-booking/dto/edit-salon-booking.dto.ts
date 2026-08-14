import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

class EditBookingServiceLineDto {
    @ApiPropertyOptional()
    @IsUUID()
    serviceId: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;
}

/**
 * Full edit — Scheduled/In Progress bookings only. Every field optional
 * (only what's actually being changed needs to be sent); re-validated
 * against the same rules create() enforces (past-date check, business-hours
 * closure, staff-branch match) since an edit can just as easily move a
 * booking into an invalid state as a fresh create can.
 */
export class EditSalonBookingDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    customerName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    customerPhone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    assignedStaffId?: string;

    @ApiPropertyOptional({ example: '2026-08-01' })
    @IsOptional()
    @IsDateString()
    bookingDate?: string;

    @ApiPropertyOptional({ example: '14:30' })
    @IsOptional()
    @IsString()
    bookingTime?: string;

    @ApiPropertyOptional({ type: [EditBookingServiceLineDto] })
    @IsOptional()
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => EditBookingServiceLineDto)
    services?: EditBookingServiceLineDto[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}

/**
 * Completed bookings only — adding one additional service line. Nothing
 * about the booking's existing service lines can change through this
 * endpoint; that immutability is enforced in the service layer, not just
 * by this DTO's shape.
 */
export class AddServiceToCompletedBookingDto {
    @ApiPropertyOptional()
    @IsUUID()
    serviceId: string;

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @IsInt()
    @Min(1)
    quantity?: number;
}