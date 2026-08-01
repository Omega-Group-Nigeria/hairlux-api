import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateLatePenaltySettingsDto {
    @ApiPropertyOptional({ description: 'Enable or disable charging a per-minute late penalty' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @ApiPropertyOptional({ description: 'Amount charged per minute late, beyond the grace period (\u20a6)', example: 100 })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    amountPerMinute?: number;
}