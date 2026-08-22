import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
    @ApiProperty({ enum: SupplierType, example: SupplierType.SUPPLIER })
    @IsEnum(SupplierType)
    type: SupplierType;

    @ApiProperty({ example: 'Beauty Supplies Nigeria Ltd' })
    @IsString()
    name: string;

    @ApiPropertyOptional({ example: 'Adaeze Nwosu' })
    @IsOptional()
    @IsString()
    contactPerson?: string;

    @ApiPropertyOptional({ example: '+2348012345678' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ example: '+2348012345678' })
    @IsOptional()
    @IsString()
    whatsapp?: string;

    @ApiPropertyOptional({ example: 'sales@beautysupplies.ng' })
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

    @ApiPropertyOptional({ example: 'Hair care wholesale' })
    @IsOptional()
    @IsString()
    vendorCategory?: string;

    // ── Banking -- deliberately no @ApiPropertyOptional example with real
    // data, and access to these three fields is gated on read at the
    // service layer, not just left to whoever can call this endpoint. ──
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

    @ApiPropertyOptional({ example: 'Net 30' })
    @IsOptional()
    @IsString()
    paymentTerms?: string;

    @ApiPropertyOptional({ example: 5 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    averageDeliveryDays?: number;

    @ApiPropertyOptional({ description: '0.00 to 5.00', example: 4.5 })
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
}