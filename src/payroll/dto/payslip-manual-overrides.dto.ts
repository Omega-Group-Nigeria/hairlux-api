import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

/**
 * Dev Feedback Round 8/9, item #5's post-release half: a correction used
 * to always be a blind full recalculation from current underlying data
 * (attendance, adjustments, compensation) -- there was no way for an
 * admin to type in a specific corrected figure directly. Every field here
 * is optional and independent; only the ones actually provided override
 * the freshly-recalculated value for that field, everything else still
 * comes from the normal calculation. grossPay/totalDeductions/netPay are
 * deliberately NOT overridable directly -- they're always re-derived from
 * whichever component values end up in play (overridden or calculated),
 * so the payslip can never end up internally inconsistent (e.g. a netPay
 * that doesn't match its own listed components).
 */
export class PayslipManualOverridesDto {
    @ApiPropertyOptional({ description: 'Override the base salary component for this payslip' })
    @IsOptional()
    @IsNumber()
    baseSalary?: number;

    @ApiPropertyOptional({ description: 'Override the allowances component for this payslip' })
    @IsOptional()
    @IsNumber()
    allowances?: number;

    @ApiPropertyOptional({ description: 'Override the overtime component for this payslip' })
    @IsOptional()
    @IsNumber()
    overtimeAmount?: number;

    @ApiPropertyOptional({ description: 'Override the commission-paid component for this payslip' })
    @IsOptional()
    @IsNumber()
    commissionPaid?: number;

    @ApiPropertyOptional({ description: 'Override the bonus component for this payslip' })
    @IsOptional()
    @IsNumber()
    bonusTotal?: number;

    @ApiPropertyOptional({ description: 'Override the attendance/absence deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    attendanceDeduction?: number;

    @ApiPropertyOptional({ description: 'Override the late-penalty deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    latePenaltyDeduction?: number;

    @ApiPropertyOptional({ description: 'Override the fine deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    fineTotal?: number;

    @ApiPropertyOptional({ description: 'Override the loan-repayment deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    loanRepayment?: number;

    @ApiPropertyOptional({ description: 'Override the tax deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    taxDeduction?: number;

    @ApiPropertyOptional({ description: 'Override the pension deduction for this payslip' })
    @IsOptional()
    @IsNumber()
    pensionDeduction?: number;

    @ApiPropertyOptional({ description: 'Override the catch-all "other deductions" total for this payslip' })
    @IsOptional()
    @IsNumber()
    otherDeductionTotal?: number;
}