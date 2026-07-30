import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalonBookingService } from './salon-booking.service';
import { AdminSalonBookingController } from './admin-salon-booking.controller';
import { StaffSalonBookingController } from './staff-salon-booking.controller';
import { SalonBookingController } from './salon-booking.controller';

@Module({
  imports: [StaffModule, InventoryModule],
  controllers: [AdminSalonBookingController, StaffSalonBookingController, SalonBookingController],
  providers: [SalonBookingService],
  exports: [SalonBookingService],
})
export class SalonBookingModule { }