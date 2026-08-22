import { IsUUID, IsInt, IsEnum, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StockType } from '@prisma/client';

export class RequestTransferDto {
    @ApiProperty({ description: 'Source inventory item (may belong to any branch)' })
    @IsUUID()
    fromItemId: string;

    @ApiProperty({ description: 'Destination branch (StaffLocation ID)' })
    @IsUUID()
    toBranchId: string;

    @ApiProperty({ enum: StockType, description: 'Which bucket this transfer moves from at the source -- the destination receives the same bucket' })
    @IsEnum(StockType)
    stockType: StockType;

    @ApiProperty({ example: 10 })
    @IsInt()
    @Min(1)
    quantity: number;
}