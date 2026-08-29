import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export enum VendorLedgerAdjustmentTypeDto {
    CREDIT = 'CREDIT',
    DEBIT = 'DEBIT',
}

export class CreateVendorLedgerAdjustmentDto {
    @ApiProperty({ enum: VendorLedgerAdjustmentTypeDto, description: 'CREDIT reduces what Hairlux owes the vendor; DEBIT increases it' })
    @IsEnum(VendorLedgerAdjustmentTypeDto)
    type: VendorLedgerAdjustmentTypeDto;

    @ApiProperty({ description: 'Adjustment amount, always positive -- direction comes from type' })
    @IsNumber()
    @IsPositive()
    amount: number;

    @ApiProperty({ description: 'Why this adjustment is being made -- shown in the vendor ledger history' })
    @IsNotEmpty()
    @IsString()
    reason: string;

    @ApiPropertyOptional({ description: 'Optional link to the specific purchase this adjustment relates to' })
    @IsOptional()
    @IsUUID()
    referencePurchaseId?: string;
}