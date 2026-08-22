import { ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSupplierDto {
    @ApiPropertyOptional({ enum: SupplierType })
    @IsOptional()
    @IsEnum(SupplierType)
    type?: SupplierType;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    contactPerson?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    whatsapp?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    address?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    city?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    state?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    vendorCategory?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    bankName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    accountNumber?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    verifiedAccountName?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    paymentTerms?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    averageDeliveryDays?: number;

    @ApiPropertyOptional({ description: '0.00 to 5.00' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(5)
    performanceRating?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Boolean)
    @IsBoolean()
    isPreferred?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    remarks?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}