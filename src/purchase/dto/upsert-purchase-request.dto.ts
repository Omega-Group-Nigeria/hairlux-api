import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PurchaseRequestLineDto } from './purchase-request-line.dto';

export class UpsertPurchaseRequestDto {
    @ApiProperty()
    @IsString()
    branchId: string;

    @ApiProperty()
    @IsString()
    vendorId: string;

    @ApiProperty({ description: 'Reason for this purchase' })
    @IsString() @IsNotEmpty()
    reason: string;

    @ApiPropertyOptional()
    @IsOptional() @IsString()
    attachmentUrl?: string;

    @ApiProperty({ type: [PurchaseRequestLineDto] })
    @IsArray() @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => PurchaseRequestLineDto)
    lines: PurchaseRequestLineDto[];
}