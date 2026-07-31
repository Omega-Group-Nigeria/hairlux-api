import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalonBookingService } from './salon-booking.service';
import { ReserveSalonBookingDto } from './dto/reserve-salon-booking.dto';

@ApiTags('Customer - Salon Booking Reservations')
@ApiBearerAuth('JWT-auth')
@Controller('salon-bookings')
export class CustomerSalonBookingController {
    constructor(private readonly salonBookingService: SalonBookingService) { }

    @Post('reserve')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Reserve a salon visit in advance',
        description: 'Generates a reservation code the customer presents at the branch. No Stylist is assigned until staff verifies the code on arrival.',
    })
    async reserve(@Body() dto: ReserveSalonBookingDto) {
        const data = await this.salonBookingService.reserve(dto);
        return { success: true, message: 'Reservation created successfully', data };
    }
}