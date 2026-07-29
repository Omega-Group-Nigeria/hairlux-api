import { IsUUID, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestTransferDto {
    @ApiProperty({ description: 'Source inventory item (may belong to any branch)' })
    @IsUUID()
    fromItemId: string;

    @ApiProperty({ description: 'Destination branch (StaffLocation ID)' })
    @IsUUID()
    toBranchId: string;

    @ApiProperty({ example: 10 })
    @IsInt()
    @Min(1)
    quantity: number;
}