import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class RequestWithdrawalDto {
    @ApiProperty({ example: 20000 })
    @IsNumber()
    @Min(1)
    amount: number;
}