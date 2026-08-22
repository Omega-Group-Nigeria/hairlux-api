import { ApiProperty } from '@nestjs/swagger';
import { ApprovalRequestType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsString, ValidateNested } from 'class-validator';

export class ChainStageDto {
    @ApiProperty({ description: 'AdminRole ID required to act at this stage' })
    @IsString()
    approverRoleId: string;
}

/**
 * The order of items in `stages` IS the stage order -- position 0 is
 * stage 1, and so on. Setting a chain always replaces the full sequence
 * for the given requestType in one call, rather than supporting
 * individual stage insert/reorder operations -- simpler for what is
 * inherently a short, occasionally-edited list.
 */
export class SetApprovalChainDto {
    @ApiProperty({ enum: ApprovalRequestType })
    @IsEnum(ApprovalRequestType)
    requestType: ApprovalRequestType;

    @ApiProperty({ type: [ChainStageDto], description: 'Ordered list of stages -- position in the array is the stage order' })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ChainStageDto)
    stages: ChainStageDto[];
}