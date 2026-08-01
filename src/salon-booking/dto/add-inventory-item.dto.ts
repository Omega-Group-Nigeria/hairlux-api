import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AddSalonBookingInventoryItemDto {
    @ApiProperty()
    @IsUUID()
    itemId: string;

    @ApiProperty()
    @IsInt()
    @Min(1)
    quantity: number;
}