import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateCommissionPlanDto {
    @ApiProperty({ description: 'e.g. "Senior Stylist Commission"' })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ description: 'Percentage as a decimal, e.g. 0.15 = 15%', minimum: 0, maximum: 1 })
    @IsNumber()
    @Min(0)
    @Max(1)
    commissionRate: number;

    @ApiPropertyOptional({ type: [String], description: 'Which services generate commission under this plan. Omit or leave empty for "every service is eligible".' })
    @IsOptional()
    @IsArray()
    @IsUUID('4', { each: true })
    eligibleServiceIds?: string[];

    @ApiPropertyOptional({ description: 'Restrict this plan to one branch. Omit for "any branch".' })
    @IsOptional()
    @IsUUID()
    applicableBranchId?: string;

    @ApiPropertyOptional({ description: 'Restrict this plan to a role. Omit for "any role".' })
    @IsOptional()
    @IsString()
    applicableRole?: string;

    @ApiProperty({ description: 'When this rate takes effect' })
    @IsDateString()
    effectiveDate: string;

    @ApiPropertyOptional({ description: 'When true, a transaction under this plan needs explicit admin approval before it counts toward payroll' })
    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}