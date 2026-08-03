import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BookingModule } from '../booking/booking.module';
import { SalonBookingService } from './salon-booking.service';
import { AdminSalonBookingController } from './admin-salon-booking.controller';
import { StaffSalonBookingController } from './staff-salon-booking.controller';
import { CustomerSalonBookingController } from './customer-salon-booking.controller';

@Module({
  imports: [StaffModule, InventoryModule, BookingModule],
  controllers: [AdminSalonBookingController, StaffSalonBookingController, CustomerSalonBookingController],
  providers: [SalonBookingService],
  exports: [SalonBookingService],
})
export class SalonBookingModule { }