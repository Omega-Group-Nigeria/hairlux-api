import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupplierType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

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
    notes?: string;
}