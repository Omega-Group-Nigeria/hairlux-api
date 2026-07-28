import { IsOptional, IsString, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectLeaveRequestDto {
    @ApiPropertyOptional({ description: 'Required when rejecting' })
    @ValidateIf(() => true)
    @IsString()
    reason: string;
}