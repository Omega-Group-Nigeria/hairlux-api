import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectTransferDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    reason: string;
}