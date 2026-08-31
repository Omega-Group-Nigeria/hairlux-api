import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SetSiteStatsDto {
    @ApiPropertyOptional({ description: 'Send null to clear the override and revert to the live-computed count.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    completedBookingsOverride?: number | null;

    @ApiPropertyOptional({ description: 'Send null to clear the override and revert to the live-computed count.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    registeredCustomersOverride?: number | null;

    @ApiPropertyOptional({ description: 'Send null to clear the override and revert to the live-computed average.' })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(5)
    averageRatingOverride?: number | null;

    @ApiPropertyOptional({ description: 'Send null to clear the override and revert to the live-computed count.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    branchesOverride?: number | null;

    @ApiPropertyOptional({ description: 'Send null to clear the override and revert to the live-computed count.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    professionalsOverride?: number | null;
}