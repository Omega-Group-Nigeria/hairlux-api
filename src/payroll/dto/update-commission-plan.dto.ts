import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UpdateCommissionPlanDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsNotEmpty()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ minimum: 0, maximum: 1 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    commissionRate?: number;

    @ApiPropertyOptional({ type: [String] })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    eligibleServiceIds?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    applicableBranchId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    applicableRole?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    effectiveDate?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}