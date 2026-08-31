import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class RejectLeaveRequestDto {
    @ApiPropertyOptional({ description: 'Required when rejecting' })
    @ValidateIf(() => true)
    @IsString()
    reason: string;
}

/** Dev Feedback Round 6, item #22. */
export class ReassignLeaveRequestDto {
    @ApiProperty({ description: 'Staff member to reassign this request to' })
    @IsUUID()
    toApproverId: string;

    @ApiProperty({ description: 'Required -- why this request is being reassigned' })
    @ValidateIf(() => true)
    @IsString()
    reason: string;
}