import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunicationChannel } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

// Matches CustomerLifecycle exactly (src/common/utils/customer-status.util.ts)
// -- kept as a literal array here rather than importing the TS type
// directly, since class-validator's @IsIn needs runtime values, not a
// type. If that union ever changes, this list needs updating alongside it.
const LIFECYCLE_VALUES = ['NEVER_VISITED', 'NEW', 'ACTIVE', 'AT_RISK', 'DORMANT', 'INACTIVE'] as const;
// Matches CustomerValue exactly (src/common/utils/customer-status.util.ts) -- same literal-array reasoning as LIFECYCLE_VALUES above.
const VALUE_TIERS = ['STANDARD', 'PREMIUM', 'VIP'] as const;
const AUDIENCE_SOURCES = ['USER', 'CUSTOMER'] as const;

export class UpsertLifecycleCampaignTemplateDto {
    @ApiProperty({ enum: LIFECYCLE_VALUES, example: 'AT_RISK' })
    @IsIn(LIFECYCLE_VALUES)
    targetLifecycle: string;

    @ApiPropertyOptional({ enum: VALUE_TIERS, description: 'Optional -- further narrows the audience to a specific Value tier. Omit or send null to match any Value tier (Dev Feedback Round 6, item #12).' })
    @IsOptional()
    @IsIn(VALUE_TIERS)
    targetValue?: string | null;

    @ApiPropertyOptional({ enum: AUDIENCE_SOURCES, description: 'Optional -- restricts this template to only User (registered Web/App accounts) or only Customer (walk-in Customer Contacts) subjects. Omit or send null to match both sources (Dev Feedback Round 6, item #12).' })
    @IsOptional()
    @IsIn(AUDIENCE_SOURCES)
    audienceSource?: string | null;

    @ApiProperty({ enum: CommunicationChannel })
    @IsEnum(CommunicationChannel)
    channel: CommunicationChannel;

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @ApiPropertyOptional({ description: 'Email subject line -- ignored for SMS/PUSH' })
    @IsOptional()
    @IsString()
    subject?: string;

    @ApiProperty({ description: 'Supports {{firstName}}, {{lastName}}, {{lastVisitDate}}', example: 'Hi {{firstName}}, it\'s been a while — we\'d love to see you again at Hairlux!' })
    @IsString()
    @IsNotEmpty()
    bodyTemplate: string;

    @ApiPropertyOptional({ default: 0, description: 'Days after the transition is detected before sending' })
    @IsOptional()
    @IsInt()
    @Min(0)
    delayDays?: number;

    @ApiPropertyOptional({ description: '0-23, local server time. Omit or send null for no time-of-day restriction -- combined with delayDays: 0, this sends as soon as the next check runs (Dev Feedback Round 6, item #11).' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(23)
    sendHour?: number | null;

    @ApiPropertyOptional({ description: '0-59. Only used when sendHour is also set.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(59)
    sendMinute?: number | null;

    @ApiPropertyOptional({ default: 30, description: 'Minimum days before this same template can send to the same person again' })
    @IsOptional()
    @IsInt()
    @Min(0)
    cooldownDays?: number;
}