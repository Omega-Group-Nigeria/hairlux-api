import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CorrectPayrollAdjustmentDto {
    @ApiProperty({ example: 30000, description: 'The corrected amount' })
    @IsNumber()
    @Min(0.01)
    amount: number;

    @ApiProperty({ example: 'Original entry double-counted the transport allowance', description: 'Why this correction is being made -- required, kept as part of the audit trail' })
    @IsString()
    @IsNotEmpty()
    correctionReason: string;
}