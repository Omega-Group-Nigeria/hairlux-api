import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommunicationChannel } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

// Matches CustomerLifecycle exactly (src/common/utils/customer-status.util.ts)
// -- kept as a literal array here rather than importing the TS type
// directly, since class-validator's @IsIn needs runtime values, not a
// type. If that union ever changes, this list needs updating alongside it.
const LIFECYCLE_VALUES = ['NEVER_VISITED', 'NEW', 'ACTIVE', 'AT_RISK', 'DORMANT', 'INACTIVE'] as const;

export class UpsertLifecycleCampaignTemplateDto {
    @ApiProperty({ enum: LIFECYCLE_VALUES, example: 'AT_RISK' })
    @IsIn(LIFECYCLE_VALUES)
    targetLifecycle: string;

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

    @ApiPropertyOptional({ default: 30, description: 'Minimum days before this same template can send to the same person again' })
    @IsOptional()
    @IsInt()
    @Min(0)
    cooldownDays?: number;
}