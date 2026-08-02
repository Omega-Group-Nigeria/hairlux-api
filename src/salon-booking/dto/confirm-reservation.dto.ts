import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ConfirmReservationDto {
    @ApiProperty({ description: 'The Stylist who will provide the service — required whether the reservation is a SalonBooking or a legacy marketplace Booking-table WALK_IN reservation. A self-service customer booking never has one assigned at booking time, so this is the moment it gets recorded.' })
    @IsUUID()
    assignedStaffId: string;
}