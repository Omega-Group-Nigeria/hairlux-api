import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { CheckAvailabilityDto } from '../dto/check-availability.dto';
import { CreateBusinessExceptionDto } from '../dto/create-business-exception.dto';
import { SetBusinessHoursDto } from '../dto/set-business-hours.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async checkAvailability(queryDto: CheckAvailabilityDto) {
    const { serviceId, date } = queryDto;

    if (!date) {
      throw new BadRequestException('Date is required');
    }

    // Keep serviceId destructuring for API compatibility, even if currently unused.
    void serviceId;

    const bookingDate = new Date(date);

    const [businessSettings, exception, dayHours] = await Promise.all([
      this.prisma.businessSettings.findFirst(),
      this.prisma.businessException.findFirst({
        where: {
          date: {
            gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
          },
        },
      }),
      this.prisma.businessHours.findUnique({
        where: { dayOfWeek: new Date(date).getDay() },
      }),
    ]);

    if (!businessSettings) {
      throw new BadRequestException('Business configuration not found');
    }

    if (exception?.isClosed) {
      return [];
    }

    const openTime = exception?.openTime ?? dayHours?.openTime;
    const closeTime = exception?.closeTime ?? dayHours?.closeTime;
    const dayIsOpen = dayHours?.isOpen ?? true;

    if (!dayIsOpen || !openTime || !closeTime) {
      return [];
    }

    const slots = this.generateTimeSlots(
      openTime,
      closeTime,
      businessSettings.slotDuration,
    );

    const availableSlots = slots;

    const startOfDay = new Date(bookingDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(bookingDate.setHours(23, 59, 59, 999));

    const existingBookings = await this.prisma.booking.findMany({
      where: {
        bookingDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    const slotsWithAvailability = availableSlots.map((slot) => {
      const isBooked = existingBookings.some((booking) => {
        return booking.bookingTime === slot;
      });

      return {
        time: slot,
        available: !isBooked,
      };
    });

    return slotsWithAvailability;
  }

  private generateTimeSlots(
    startTime: string,
    endTime: string,
    slotDuration: number,
  ): string[] {
    const slots: string[] = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    let currentHour = startHour;
    let currentMinute = startMinute;

    while (
      currentHour < endHour ||
      (currentHour === endHour && currentMinute < endMinute)
    ) {
      const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
      slots.push(timeString);

      currentMinute += slotDuration;
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60);
        currentMinute = currentMinute % 60;
      }
    }

    return slots;
  }

  async getBusinessHours() {
    const cached = await this.redis.get('booking:business-hours');
    if (cached) return cached;

    const hours = await this.prisma.businessHours.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });
    await this.redis.set('booking:business-hours', hours, 3600);
    return hours;
  }

  async setBusinessHours(dto: SetBusinessHoursDto) {
    const results = await this.prisma.$transaction(
      dto.hours.map((day) =>
        this.prisma.businessHours.upsert({
          where: { dayOfWeek: day.dayOfWeek },
          update: {
            openTime: day.openTime,
            closeTime: day.closeTime,
            isOpen: day.isOpen ?? true,
          },
          create: {
            dayOfWeek: day.dayOfWeek,
            openTime: day.openTime,
            closeTime: day.closeTime,
            isOpen: day.isOpen ?? true,
          },
        }),
      ),
    );
    await this.redis.del('booking:business-hours');
    return results;
  }

  async updateBusinessHoursDay(
    dayOfWeek: number,
    dto: Partial<SetBusinessHoursDto['hours'][0]>,
  ) {
    const existing = await this.prisma.businessHours.findUnique({
      where: { dayOfWeek },
    });
    if (!existing) {
      throw new NotFoundException(
        `No business hours configured for day ${dayOfWeek}`,
      );
    }
    return this.prisma.businessHours
      .update({
        where: { dayOfWeek },
        data: {
          ...(dto.openTime !== undefined && { openTime: dto.openTime }),
          ...(dto.closeTime !== undefined && { closeTime: dto.closeTime }),
          ...(dto.isOpen !== undefined && { isOpen: dto.isOpen }),
        },
      })
      .then(async (result) => {
        await this.redis.del('booking:business-hours');
        return result;
      });
  }

  async getBusinessExceptions() {
    const cached = await this.redis.get('booking:business-exceptions');
    if (cached) return cached;

    const exceptions = await this.prisma.businessException.findMany({
      orderBy: { date: 'asc' },
    });
    await this.redis.set('booking:business-exceptions', exceptions, 3600);
    return exceptions;
  }

  async createBusinessException(dto: CreateBusinessExceptionDto) {
    const date = new Date(dto.date);
    date.setUTCHours(0, 0, 0, 0);

    const existing = await this.prisma.businessException.findFirst({
      where: {
        date: {
          gte: new Date(date.getTime()),
          lte: new Date(date.getTime() + 86399999),
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `An exception already exists for ${dto.date}`,
      );
    }

    if (dto.isClosed === false && (!dto.openTime || !dto.closeTime)) {
      throw new BadRequestException(
        'openTime and closeTime are required when isClosed is false',
      );
    }

    const created = await this.prisma.businessException.create({
      data: {
        date,
        isClosed: dto.isClosed ?? true,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
        reason: dto.reason,
      },
    });
    await this.redis.del('booking:business-exceptions');
    return created;
  }

  async deleteBusinessException(id: string) {
    const existing = await this.prisma.businessException.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Exception not found');
    await this.prisma.businessException.delete({ where: { id } });
    await this.redis.del('booking:business-exceptions');
  }
}
