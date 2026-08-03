import { ApiProperty } from '@nestjs/swagger';
import { PayslipAdjustmentType } from '@prisma/client';
import { IsEnum, IsNumber, IsString, IsUUID, Min } from 'class-validator';

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
}