import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class ReassignApprovalDto {
    @ApiProperty({ description: 'staffId of the person this request is being reassigned to' })
    @IsUUID()
    toApproverId: string;

    @ApiPropertyOptional({ description: 'Why this is being handed off (e.g. "needs HR context")' })
    @IsString()
    reason: string;
}
