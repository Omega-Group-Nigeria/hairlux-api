import { IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OfferResponseAction {
    ACCEPT = 'ACCEPT',
    DECLINE = 'DECLINE',
}

export class RespondToOfferDto {
    @ApiProperty({ enum: OfferResponseAction })
    @IsEnum(OfferResponseAction)
    response: OfferResponseAction;

    @ApiPropertyOptional({ description: 'Required when declining' })
    @ValidateIf((o) => o.response === OfferResponseAction.DECLINE)
    @IsString()
    declineReason?: string;
}