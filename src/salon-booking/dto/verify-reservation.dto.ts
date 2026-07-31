import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class VerifyReservationDto {
    @ApiProperty({ description: 'The Stylist who will provide the service' })
    @IsUUID()
    assignedStaffId: string;
}