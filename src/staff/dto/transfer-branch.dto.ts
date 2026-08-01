import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferBranchDto {
    @ApiProperty({ description: 'The branch this staff member is moving to' })
    @IsUUID()
    newLocationId: string;

    @ApiPropertyOptional({ description: 'Why this transfer is happening' })
    @IsOptional()
    @IsString()
    reason?: string;

    @ApiPropertyOptional({ example: '2026-08-15', description: 'Defaults to today if not provided' })
    @IsOptional()
    @IsDateString()
    effectiveDate?: string;
}