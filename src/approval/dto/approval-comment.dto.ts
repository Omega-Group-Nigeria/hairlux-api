import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ApprovalCommentDto {
    @ApiPropertyOptional({ description: 'Reason / note attached to this action' })
    @IsOptional()
    @IsString()
    comment?: string;
}
