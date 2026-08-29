import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePurchaseRequestFromAlertsDto {
    @ApiPropertyOptional({ type: [String], description: 'LowStockAlert ids to push into the new request' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    lowStockAlertIds?: string[];

    @ApiPropertyOptional({ type: [String], description: 'ExpiryAlert ids to push into the new request' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    expiryAlertIds?: string[];

    @ApiProperty({ description: 'Which vendor to raise the request against' })
    @IsUUID()
    vendorId: string;

    @ApiPropertyOptional({ description: 'Defaults to "Auto-generated from stock alerts" if omitted' })
    @IsOptional()
    @IsString()
    reason?: string;
}