import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SetBranchManagerDto {
    @ApiProperty({ description: 'staffId of the person being appointed manager of this branch' })
    @IsUUID()
    staffId: string;
}
