import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunicationChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

// Matches CustomerLifecycle exactly (src/common/utils/customer-status.util.ts)
// -- same literal-array approach as UpsertLifecycleCampaignTemplateDto,
// kept in sync manually since class-validator needs runtime values.
const LIFECYCLE_VALUES = ['NEVER_VISITED', 'NEW', 'ACTIVE', 'AT_RISK', 'DORMANT', 'INACTIVE'] as const;

/**
 * Dev Feedback Round 4, item #9. stepOrder is deliberately NOT a field
 * here -- it's derived from the step's position in the steps array on
 * the parent DTO, so reordering steps in the admin UI is just reordering
 * the array, not separately renumbering an explicit field that could get
 * out of sync with the array itself.
 */
export class UpsertLifecycleCampaignSequenceStepDto {
    @ApiProperty({ enum: CommunicationChannel })
    @IsEnum(CommunicationChannel)
    channel: CommunicationChannel;

    @ApiPropertyOptional({ description: 'Email subject line -- ignored for SMS/PUSH' })
    @IsOptional()
    @IsString()
    subject?: string;

    @ApiProperty({ description: 'Supports {{firstName}}, {{lastName}}, {{lastVisitDate}}' })
    @IsString()
    @IsNotEmpty()
    bodyTemplate: string;

    @ApiPropertyOptional({ default: 0, description: 'For the first step: minutes after the lifecycle transition. For later steps: minutes after the PREVIOUS step was processed.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    delayAfterPreviousMinutes?: number;

    @ApiPropertyOptional({ description: '0-23, local server time. Omit for no time-of-day restriction.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(23)
    sendHour?: number;

    @ApiPropertyOptional({ description: '0-59. Only used when sendHour is also set.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(59)
    sendMinute?: number;
}

export class UpsertLifecycleCampaignSequenceDto {
    @ApiProperty({ enum: LIFECYCLE_VALUES, example: 'AT_RISK' })
    @IsIn(LIFECYCLE_VALUES)
    targetLifecycle: string;

    @ApiProperty({ example: 'At-Risk Re-engagement Sequence' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @ApiPropertyOptional({ default: 30, description: 'Minimum days before this whole sequence can start again for the same person' })
    @IsOptional()
    @IsInt()
    @Min(0)
    cooldownDays?: number;

    @ApiProperty({ type: [UpsertLifecycleCampaignSequenceStepDto], description: 'Full, ordered replacement of this sequence\'s steps -- array position is the execution order.' })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => UpsertLifecycleCampaignSequenceStepDto)
    steps: UpsertLifecycleCampaignSequenceStepDto[];
}