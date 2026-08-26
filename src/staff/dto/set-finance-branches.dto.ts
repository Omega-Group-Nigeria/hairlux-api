import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class SetFinanceBranchesDto {
    @ApiProperty({
        type: [String],
        description: 'Full replacement of the branches (beyond their own primary one) this staff member can access for Branch Finance -- send every branch that should remain, not just what changed.',
    })
    @IsArray()
    @IsUUID('4', { each: true })
    branchIds: string[];
}