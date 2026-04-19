import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { BookingAnalyticsService } from './services/booking-analytics.service';
import { BookingCoreService } from './services/booking-core.service';
import { BookingPaymentService } from './services/booking-payment.service';
import { AvailabilityService } from './services/availability.service';
import { ReservationService } from './services/reservation.service';
import { AdminCreateBookingDto } from './dto/admin-create-booking.dto';
import { AdminQueryBookingsDto } from './dto/admin-query-bookings.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateBusinessExceptionDto } from './dto/create-business-exception.dto';
import { GetCalendarDto } from './dto/get-calendar.dto';
import { GetStatsDto } from './dto/get-stats.dto';
import { InitializeBookingPaymentDto } from './dto/initialize-booking-payment.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { SetBusinessHoursDto } from './dto/set-business-hours.dto';
import { VerifyBookingPaymentDto } from './dto/verify-booking-payment.dto';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingPaymentService: BookingPaymentService,
    private readonly bookingCoreService: BookingCoreService,
    private readonly bookingAnalyticsService: BookingAnalyticsService,
    private readonly availabilityService: AvailabilityService,
    private readonly reservationService: ReservationService,
  ) {}

  async checkAvailability(queryDto: CheckAvailabilityDto) {
    return this.availabilityService.checkAvailability(queryDto);
  }

  async create(userId: string, createBookingDto: CreateBookingDto) {
    return this.bookingPaymentService.create(userId, createBookingDto);
  }

  async initializeBookingPayment(
    userId: string,
    dto: InitializeBookingPaymentDto,
  ) {
    return this.bookingPaymentService.initializeBookingPayment(userId, dto);
  }

  async verifyBookingPayment(userId: string, dto: VerifyBookingPaymentDto) {
    return this.bookingPaymentService.verifyBookingPayment(userId, dto);
  }

  async verifyBookingPaymentByReference(bookingPaymentReference: string) {
    return this.bookingPaymentService.verifyBookingPaymentByReference(
      bookingPaymentReference,
    );
  }

  async getBookingPaymentStatus(userId: string, bookingPaymentReference: string) {
    return this.bookingPaymentService.getBookingPaymentStatus(
      userId,
      bookingPaymentReference,
    );
  }

  async findUserBookings(userId: string, queryDto: QueryBookingsDto) {
    return this.bookingCoreService.findUserBookings(userId, queryDto);
  }

  async findOne(id: string, userId: string) {
    return this.bookingCoreService.findOne(id, userId);
  }

  async reschedule(
    id: string,
    userId: string,
    rescheduleDto: RescheduleBookingDto,
  ) {
    return this.bookingCoreService.reschedule(id, userId, rescheduleDto);
  }

  async updateStatus(
    id: string,
    userId: string,
    status: BookingStatus,
    reason?: string,
  ) {
    return this.bookingCoreService.updateStatus(id, userId, status, reason);
  }

  async findAllBookings(queryDto: AdminQueryBookingsDto) {
    return this.bookingAnalyticsService.findAllBookings(queryDto);
  }

  async findOneAdmin(id: string) {
    return this.bookingAnalyticsService.findOneAdmin(id);
  }

  async createAdminBooking(createDto: AdminCreateBookingDto) {
    return this.bookingAnalyticsService.createAdminBooking(createDto);
  }

  async updateStatusAdmin(id: string, status: BookingStatus) {
    return this.bookingAnalyticsService.updateStatusAdmin(id, status);
  }

  async getCalendar(calendarDto: GetCalendarDto) {
    return this.bookingAnalyticsService.getCalendar(calendarDto);
  }

  async getStats(statsDto: GetStatsDto) {
    return this.bookingAnalyticsService.getStats(statsDto);
  }

  async getBusinessHours() {
    return this.availabilityService.getBusinessHours();
  }

  async setBusinessHours(dto: SetBusinessHoursDto) {
    return this.availabilityService.setBusinessHours(dto);
  }

  async updateBusinessHoursDay(
    dayOfWeek: number,
    dto: Partial<SetBusinessHoursDto['hours'][0]>,
  ) {
    return this.availabilityService.updateBusinessHoursDay(dayOfWeek, dto);
  }

  async getBusinessExceptions() {
    return this.availabilityService.getBusinessExceptions();
  }

  async createBusinessException(dto: CreateBusinessExceptionDto) {
    return this.availabilityService.createBusinessException(dto);
  }

  async deleteBusinessException(id: string) {
    return this.availabilityService.deleteBusinessException(id);
  }

  async findByReservationCode(code: string, userId: string) {
    return this.reservationService.findByReservationCode(code, userId);
  }

  async adminFindByReservationCode(code: string) {
    return this.reservationService.adminFindByReservationCode(code);
  }

  async useReservation(code: string) {
    return this.reservationService.useReservation(code);
  }
}
