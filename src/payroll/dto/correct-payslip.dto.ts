import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PayslipManualOverridesDto } from './payslip-manual-overrides.dto';

export class CorrectPayslipDto {
    @ApiProperty({ description: 'Why this payslip is being corrected -- shown to the staff member as the correction reference' })
    @IsNotEmpty()
    @IsString()
    reason: string;

    @ApiPropertyOptional({
        type: PayslipManualOverridesDto,
        description: 'Dev Feedback Round 8/9: specific fields to override directly instead of trusting the full recalculation for them -- omit entirely for the previous, purely-recalculated behavior.',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PayslipManualOverridesDto)
    overrides?: PayslipManualOverridesDto;
}