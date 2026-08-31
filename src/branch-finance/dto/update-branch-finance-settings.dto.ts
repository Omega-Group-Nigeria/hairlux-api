import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class UpdateBranchFinanceSettingsDto {
    @ApiProperty({ example: '12:00', description: '24-hour "HH:mm" format, WAT.' })
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'submissionDeadlineTime must be in 24-hour "HH:mm" format, e.g. "12:00"' })
    submissionDeadlineTime: string;
}