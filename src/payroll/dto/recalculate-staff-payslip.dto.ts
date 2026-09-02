import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PayslipManualOverridesDto } from './payslip-manual-overrides.dto';

export class RecalculateStaffPayslipDto {
    @ApiPropertyOptional({ description: 'Why this staff member\u2019s payslip is being recalculated' })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiPropertyOptional({
        type: PayslipManualOverridesDto,
        description: 'Dev Feedback Round 8/9: same manual-override mechanism as the post-release correction endpoint -- omit entirely for a pure recalculation.',
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PayslipManualOverridesDto)
    overrides?: PayslipManualOverridesDto;
}