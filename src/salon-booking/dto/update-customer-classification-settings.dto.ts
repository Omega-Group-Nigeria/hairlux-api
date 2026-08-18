import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, Min } from 'class-validator';

/**
 * Every field optional — only what's actually sent gets updated, matching
 * the update-late-penalty-settings.dto.ts convention for this codebase's
 * other single-row settings tables.
 */
export class UpdateCustomerClassificationSettingsDto {
    @ApiPropertyOptional({ description: 'Minimum spend to reach Premium value tier', example: 50000 })
    @IsOptional()
    @IsPositive()
    premiumSpendThreshold?: number;

    @ApiPropertyOptional({ description: 'Minimum spend to reach VIP value tier', example: 200000 })
    @IsOptional()
    @IsPositive()
    vipSpendThreshold?: number;

    @ApiPropertyOptional({ description: 'Account age (days) under which a customer can still be classified New', example: 30 })
    @IsOptional()
    @IsInt()
    @Min(1)
    newAccountAgeDays?: number;

    @ApiPropertyOptional({ description: 'Completed-visit count below which a customer can still be classified New', example: 3 })
    @IsOptional()
    @IsInt()
    @Min(0)
    newVisitCountThreshold?: number;

    @ApiPropertyOptional({ description: 'Days since last visit, at or under which a customer is Active', example: 30 })
    @IsOptional()
    @IsInt()
    @Min(1)
    activeDaysThreshold?: number;

    @ApiPropertyOptional({ description: 'Days since last visit, at or under which a customer is At Risk (beyond Active)', example: 90 })
    @IsOptional()
    @IsInt()
    @Min(1)
    atRiskDaysThreshold?: number;

    @ApiPropertyOptional({ description: 'Days since last visit, at or under which a customer is Dormant (beyond At Risk) — beyond this is Inactive', example: 180 })
    @IsOptional()
    @IsInt()
    @Min(1)
    dormantDaysThreshold?: number;
}