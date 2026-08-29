import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayslipAdjustmentType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePayrollAdjustmentDto {
    @ApiProperty({ example: 'staff-uuid' })
    @IsUUID()
    staffId: string;

    @ApiProperty({ enum: PayslipAdjustmentType })
    @IsEnum(PayslipAdjustmentType)
    type: PayslipAdjustmentType;

    @ApiProperty({
        example: 'Performance Bonus',
        description: 'Free-text category — e.g. Performance Bonus, Sales Incentive, Appreciation Bonus, Special Reward, Loan Repayment, Damage Charges, Cash Shortages, Administrative Penalty',
    })
    @IsString()
    category: string;

    @ApiProperty({ example: 25000 })
    @IsNumber()
    @Min(0.01)
    amount: number;

    @ApiProperty({ example: 'Exceeded monthly sales target by 20%' })
    @IsString()
    reason: string;

    @ApiPropertyOptional({ description: 'The date this bonus/deduction actually pertains to (e.g. the date of the incident it charges for) -- distinct from when the record is entered.' })
    @IsOptional()
    @IsDateString()
    effectiveDate?: string;

    @ApiPropertyOptional({ description: 'Longer free-text detail alongside the shorter reason field.' })
    @IsOptional()
    @IsString()
    notes?: string;
}