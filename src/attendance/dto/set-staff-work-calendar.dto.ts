import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { StaffWorkDayDto } from './staff-work-day.dto';

export class SetStaffWorkCalendarDto {
    @ApiProperty({
        type: [StaffWorkDayDto],
        description: 'One entry per day of week actually being set — days omitted fall back to the company BusinessHours for that day. Send all 7 to fully define the week.',
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(7)
    @ValidateNested({ each: true })
    @Type(() => StaffWorkDayDto)
    days: StaffWorkDayDto[];
}