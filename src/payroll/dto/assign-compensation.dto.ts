import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class AssignCompensationDto {
    @ApiPropertyOptional({ enum: ['SALARY', 'SALARY_TO_COMMISSION', 'SALARY_PLUS_COMMISSION', 'COMMISSION'], description: 'Which payroll calculation path applies to this staff member.' })
    @IsOptional()
    @IsIn(['SALARY', 'SALARY_TO_COMMISSION', 'SALARY_PLUS_COMMISSION', 'COMMISSION'])
    compensationType?: string;

    @ApiPropertyOptional({ description: 'Which Commission Plan this staff member is assigned to. Send null to unassign.' })
    @IsOptional()
    @IsUUID()
    commissionPlanId?: string;
}