import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CorrectPayslipDto {
    @ApiProperty({ description: 'Why this payslip is being corrected -- shown to the staff member as the correction reference' })
    @IsNotEmpty()
    @IsString()
    reason: string;
}