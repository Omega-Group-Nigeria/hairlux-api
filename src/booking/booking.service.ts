import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { QueryBookingsDto } from './dto/query-bookings.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { AdminQueryBookingsDto } from './dto/admin-query-bookings.dto';
import { AdminCreateBookingDto } from './dto/admin-create-booking.dto';
import { GetCalendarDto } from './dto/get-calendar.dto';
import { GetStatsDto } from './dto/get-stats.dto';
import { SetBusinessHoursDto } from './dto/set-business-hours.dto';
import { CreateBusinessExceptionDto } from './dto/create-business-exception.dto';
import {
  BookingStatus,
  PaymentMethod,
  TransactionType,
  TransactionStatus,
} from '@prisma/client';

@Injectable()
export class BookingService {
  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private mailService: MailService,
    private redis: RedisService,
  ) {}

  async checkAvailability(queryDto: CheckAvailabilityDto) {
    const { serviceId, date } = queryDto;

    if (!date) {
      throw new BadRequestException('Date is required');
    }

    // Parse the date
    const bookingDate = new Date(date);

    // Load config and hours for this specific date in parallel
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

    // Exception takes precedence over regular hours
    if (exception?.isClosed) {
      return []; // Business is closed on this date
    }

    const openTime = exception?.openTime ?? dayHours?.openTime;
    const closeTime = exception?.closeTime ?? dayHours?.closeTime;
    const dayIsOpen = dayHours?.isOpen ?? true;

    if (!dayIsOpen || !openTime || !closeTime) {
      return []; // Closed day or hours not configured
    }

    const slots = this.generateTimeSlots(
      openTime,
      closeTime,
      businessSettings.slotDuration,
    );

    const availableSlots = slots;

    // Get all bookings for this date
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
        ...(serviceId && { serviceId }),
      },
      include: {
        service: true,
      },
    });

    // Mark slots as unavailable based on existing bookings
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

  async create(userId: string, createBookingDto: CreateBookingDto) {
    const { services, date, time, addressId, paymentMethod } = createBookingDto;

    // Validate address
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (!address.latitude || !address.longitude) {
      throw new BadRequestException(
        'Address must have location coordinates (latitude and longitude)',
      );
    }

    // Fetch user once for confirmation email
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    const bookingDate = new Date(`${date}T${time}`);

    // Validate every service up-front before touching anything
    const serviceRecords: {
      serviceId: string;
      notes?: string;
      price: any;
      name: string;
    }[] = [];

    for (const item of services) {
      const service = await this.prisma.service.findUnique({
        where: { id: item.serviceId },
      });

      if (!service) {
        throw new NotFoundException(`Service ${item.serviceId} not found`);
      }

      if (service.status !== 'ACTIVE') {
        throw new BadRequestException(
          `Service "${service.name}" is not available`,
        );
      }

      serviceRecords.push({
        serviceId: service.id,
        notes: item.notes,
        price: service.price,
        name: service.name,
      });
    }

    // Check time slot availability
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        bookingDate,
        bookingTime: time,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
    });

    if (existingBooking) {
      throw new ConflictException('This time slot is already booked');
    }

    const totalAmount = serviceRecords.reduce(
      (sum, s) => sum + Number(s.price),
      0,
    );

    // ── WALLET: check balance then create + pay atomically ───────────────────
    if (paymentMethod === PaymentMethod.WALLET) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.balance) < totalAmount) {
        throw new BadRequestException(
          `Insufficient wallet balance. Required: ${totalAmount}, Available: ${Number(wallet.balance)}`,
        );
      }

      const serviceNames = serviceRecords.map((s) => s.name).join(', ');

      const bookings = await this.prisma.$transaction(async (tx) => {
        // Debit wallet
        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: totalAmount } },
        });

        // Create all bookings as CONFIRMED
        const created = await Promise.all(
          serviceRecords.map((s) =>
            tx.booking.create({
              data: {
                userId,
                serviceId: s.serviceId,
                addressId,
                bookingDate,
                bookingTime: time,
                totalAmount: s.price,
                paymentMethod: PaymentMethod.WALLET,
                status: BookingStatus.CONFIRMED,
                notes: s.notes,
              },
              include: {
                service: {
                  select: {
                    id: true,
                    name: true,
                    description: true,
                    price: true,
                    duration: true,
                  },
                },
                address: true,
                staff: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            }),
          ),
        );

        // Single transaction record for the whole group
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: totalAmount,
            type: TransactionType.DEBIT,
            description: `Payment for: ${serviceNames}`,
            reference: `BOOK-${created[0].id}-${Date.now()}`,
            status: TransactionStatus.COMPLETED,
          },
        });

        return created;
      });

      // Fire booking confirmation email (non-fatal)
      if (user) {
        try {
          await this.mailService.sendBookingConfirmationEmail(
            user.email,
            user.firstName,
            {
              services: bookings.map((b) => ({
                name: b.service.name,
                price: Number(b.service.price),
                duration: b.service.duration ?? 0,
              })),
              date,
              time,
              address: `${address.addressLine}, ${address.city}, ${address.state}`,
              totalAmount,
              paymentMethod: 'WALLET',
              bookingIds: bookings.map((b) => b.id),
            },
          );
        } catch (_) {}
      }

      // Invalidate analytics + wallet balance (wallet debited)
      void Promise.all([
        this.redis.delByPattern('analytics:*'),
        this.redis.del(`wallet:balance:${userId}`),
      ]);

      return {
        bookings,
        totalAmount,
        paymentMethod: PaymentMethod.WALLET,
        message: 'Payment successful. Booking confirmed.',
      };
    }

    // ── CASH: create bookings as PENDING, collect on delivery ────────────────
    const bookings = await this.prisma.$transaction(
      serviceRecords.map((s) =>
        this.prisma.booking.create({
          data: {
            userId,
            serviceId: s.serviceId,
            addressId,
            bookingDate,
            bookingTime: time,
            totalAmount: s.price,
            paymentMethod: PaymentMethod.CASH,
            status: BookingStatus.PENDING,
            notes: s.notes,
          },
          include: {
            service: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                duration: true,
              },
            },
            address: true,
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
          },
        }),
      ),
    );

    // Fire booking confirmation email (non-fatal)
    if (user) {
      try {
        await this.mailService.sendBookingConfirmationEmail(
          user.email,
          user.firstName,
          {
            services: bookings.map((b) => ({
              name: b.service.name,
              price: Number(b.service.price),
              duration: b.service.duration ?? 0,
            })),
            date,
            time,
            address: `${address.addressLine}, ${address.city}, ${address.state}`,
            totalAmount,
            paymentMethod: 'CASH',
            bookingIds: bookings.map((b) => b.id),
          },
        );
      } catch (_) {}
    }

    // Invalidate analytics (new booking added)
    void this.redis.delByPattern('analytics:*');

    return {
      bookings,
      totalAmount,
      paymentMethod: PaymentMethod.CASH,
      message: 'Booking reserved. Payment will be collected on delivery.',
    };
  }

  async findUserBookings(userId: string, queryDto: QueryBookingsDto) {
    const { status, startDate, endDate } = queryDto;

    const where: {
      userId: string;
      status?: BookingStatus;
      date?: { gte?: Date; lte?: Date };
    } = { userId };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
            duration: true,
          },
        },
        address: true,
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: {
        bookingDate: 'desc',
      },
    });

    return bookings;
  }

  async findOne(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        service: true,
        address: true,
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Users can only see their own bookings
    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    return booking;
  }

  async reschedule(
    id: string,
    userId: string,
    rescheduleDto: RescheduleBookingDto,
  ) {
    const { date, time, reason } = rescheduleDto;

    // Get existing booking
    const booking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Cannot reschedule completed or cancelled bookings',
      );
    }

    // Check if new slot is available
    const newBookingDate = new Date(`${date}T${time}`);
    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        id: { not: id },
        bookingDate: newBookingDate,
        bookingTime: time,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    if (existingBooking) {
      throw new ConflictException('This time slot is already booked');
    }

    // Update booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        bookingDate: newBookingDate,
        bookingTime: time,
        notes: reason ? `Rescheduled: ${reason}` : booking.notes,
      },
      include: {
        service: true,
        address: true,
        staff: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedBooking;
  }

  async updateStatus(
    id: string,
    userId: string,
    status: BookingStatus,
    reason?: string,
  ) {
    // Get existing booking
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('You do not have access to this booking');
    }

    // Users can only cancel their bookings
    if (status !== BookingStatus.CANCELLED) {
      throw new ForbiddenException('Users can only cancel bookings');
    }

    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel completed bookings');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    // Update booking and refund if paid via wallet
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status,
          cancelReason: reason,
        },
        include: {
          service: true,
          address: true,
        },
      });

      // Refund wallet if payment was made via wallet
      if (booking.paymentMethod === PaymentMethod.WALLET) {
        const wallet = await tx.wallet.findUnique({
          where: { userId: booking.userId },
        });

        if (wallet) {
          const refundAmount = Number(booking.totalAmount);

          await tx.wallet.update({
            where: { userId: booking.userId },
            data: {
              balance: {
                increment: refundAmount,
              },
            },
          });

          await tx.transaction.create({
            data: {
              walletId: wallet.id,
              amount: refundAmount,
              type: TransactionType.CREDIT,
              description: `Refund for cancelled booking`,
              reference: `REFUND-${booking.id}`,
              status: TransactionStatus.COMPLETED,
            },
          });
        }
      }

      return updatedBooking;
    });

    // Invalidate analytics; also wallet balance if refund was issued
    void Promise.all([
      this.redis.delByPattern('analytics:*'),
      ...(booking.paymentMethod === PaymentMethod.WALLET
        ? [this.redis.del(`wallet:balance:${userId}`)]
        : []),
    ]);

    return result;
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

  // ==================== ADMIN METHODS ====================

  async findAllBookings(queryDto: AdminQueryBookingsDto) {
    const {
      status,
      startDate,
      endDate,
      userId,
      serviceId,
      search,
      page = 1,
      limit = 20,
    } = queryDto;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.bookingDate = {};
      if (startDate) {
        where.bookingDate.gte = new Date(startDate);
      }
      if (endDate) {
        where.bookingDate.lte = new Date(endDate);
      }
    }

    if (userId) {
      where.userId = userId;
    }

    if (serviceId) {
      where.serviceId = serviceId;
    }

    if (search) {
      where.user = {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              price: true,
              duration: true,
            },
          },
          address: true,
        },
        orderBy: {
          bookingDate: 'desc',
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings.map((booking) => ({
        ...booking,
        totalAmount: Number(booking.totalAmount),
        service: {
          ...booking.service,
          price: Number(booking.service.price),
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAdmin(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            duration: true,
            category: true,
          },
        },
        address: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      service: {
        ...booking.service,
        price: Number(booking.service.price),
      },
    };
  }

  async createAdminBooking(createDto: AdminCreateBookingDto) {
    const {
      userId,
      serviceId,
      addressId,
      bookingDate,
      bookingTime,
      paymentMethod,
      notes,
    } = createDto;

    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify service exists and is active
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    if (service.status !== 'ACTIVE') {
      throw new BadRequestException('Service is not available');
    }

    // Verify address exists and belongs to user
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    if (address.userId !== userId) {
      throw new BadRequestException('Address does not belong to user');
    }

    // Verify address has coordinates
    if (!address.latitude || !address.longitude) {
      throw new BadRequestException(
        'Address must have latitude and longitude coordinates',
      );
    }

    // Check if slot is available
    const parsedDate = new Date(bookingDate);
    const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

    const existingBooking = await this.prisma.booking.findFirst({
      where: {
        bookingDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        bookingTime,
        status: {
          in: [BookingStatus.PENDING, BookingStatus.CONFIRMED],
        },
      },
    });

    if (existingBooking) {
      throw new ConflictException(
        'This time slot is already booked. Please choose another time.',
      );
    }

    // Create booking with payment if method specified
    const totalAmount = service.price;
    const status = paymentMethod
      ? BookingStatus.CONFIRMED
      : BookingStatus.PENDING;

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        serviceId,
        addressId,
        bookingDate: new Date(bookingDate),
        bookingTime,
        totalAmount,
        status,
        paymentMethod: paymentMethod || PaymentMethod.CASH,
        notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        service: true,
        address: true,
      },
    });

    // Process payment if method specified (walk-in)
    if (paymentMethod) {
      if (paymentMethod === PaymentMethod.WALLET) {
        // Process wallet payment
        const wallet = await this.prisma.wallet.findUnique({
          where: { userId },
        });

        if (!wallet || wallet.balance < totalAmount) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        await this.prisma.$transaction([
          this.prisma.wallet.update({
            where: { userId },
            data: {
              balance: {
                decrement: totalAmount,
              },
            },
          }),
          this.prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.DEBIT,
              amount: totalAmount,
              description: `Payment for booking #${booking.id}`,
              reference: booking.id,
              status: TransactionStatus.COMPLETED,
            },
          }),
        ]);
      }
      // CASH payment doesn't require any transaction
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      service: {
        ...booking.service,
        price: Number(booking.service.price),
      },
    };
  }

  async updateStatusAdmin(id: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
        service: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Validate status transitions
    if (booking.status === BookingStatus.COMPLETED) {
      throw new BadRequestException('Cannot modify a completed booking');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot modify a cancelled booking');
    }

    // Handle refunds for cancellations
    const result = await this.prisma.$transaction(async (prisma) => {
      const updatedBooking = await prisma.booking.update({
        where: { id },
        data: { status },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          service: {
            select: {
              id: true,
              name: true,
              price: true,
              duration: true,
            },
          },
          address: true,
        },
      });

      // Process refund if cancelling a confirmed/pending booking
      if (
        status === BookingStatus.CANCELLED &&
        (booking.status === BookingStatus.CONFIRMED ||
          booking.status === BookingStatus.PENDING)
      ) {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: booking.userId },
        });

        if (wallet) {
          await prisma.wallet.update({
            where: { userId: booking.userId },
            data: {
              balance: {
                increment: booking.totalAmount,
              },
            },
          });

          await prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.CREDIT,
              amount: booking.totalAmount,
              description: `Refund for cancelled booking #${booking.id}`,
              reference: `REFUND-${booking.id}`,
              status: TransactionStatus.COMPLETED,
            },
          });
        }
      }

      return updatedBooking;
    });

    // Invalidate analytics; also wallet balance if booking was cancelled with refund
    void Promise.all([
      this.redis.delByPattern('analytics:*'),
      ...(status === BookingStatus.CANCELLED &&
      booking.paymentMethod === PaymentMethod.WALLET
        ? [this.redis.del(`wallet:balance:${booking.userId}`)]
        : []),
    ]);

    return {
      ...result,
      totalAmount: Number(result.totalAmount),
      service: {
        ...result.service,
        price: Number(result.service.price),
      },
    };
  }

  async getCalendar(calendarDto: GetCalendarDto) {
    const { month, year } = calendarDto;

    // Validate month
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }

    // Get first and last day of month
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

    // Get all bookings for the month
    const bookings = await this.prisma.booking.findMany({
      where: {
        bookingDate: {
          gte: firstDay,
          lte: lastDay,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            duration: true,
          },
        },
      },
      orderBy: [
        {
          bookingDate: 'asc',
        },
        {
          bookingTime: 'asc',
        },
      ],
    });

    // Group bookings by date
    const calendar: Record<string, any[]> = {};

    bookings.forEach((booking) => {
      const dateKey = booking.bookingDate.toISOString().split('T')[0];
      if (!calendar[dateKey]) {
        calendar[dateKey] = [];
      }
      calendar[dateKey].push({
        id: booking.id,
        time: booking.bookingTime,
        status: booking.status,
        user: booking.user,
        service: booking.service,
      });
    });

    return {
      month,
      year,
      bookings: calendar,
      summary: {
        totalBookings: bookings.length,
        pending: bookings.filter((b) => b.status === BookingStatus.PENDING)
          .length,
        confirmed: bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
          .length,
        completed: bookings.filter((b) => b.status === BookingStatus.COMPLETED)
          .length,
        cancelled: bookings.filter((b) => b.status === BookingStatus.CANCELLED)
          .length,
      },
    };
  }

  async getStats(statsDto: GetStatsDto) {
    const { startDate, endDate } = statsDto;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new BadRequestException('Start date must be before end date');
    }

    // Get bookings in date range
    const bookings = await this.prisma.booking.findMany({
      where: {
        bookingDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        service: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    // Calculate stats
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(
      (b) => b.status === BookingStatus.COMPLETED,
    );
    const totalRevenue = completedBookings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0,
    );

    // Group by status
    const byStatus = {
      pending: bookings.filter((b) => b.status === BookingStatus.PENDING)
        .length,
      confirmed: bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
        .length,
      completed: completedBookings.length,
      cancelled: bookings.filter((b) => b.status === BookingStatus.CANCELLED)
        .length,
    };

    // Group by service
    const serviceStats: Record<string, any> = {};
    bookings.forEach((booking) => {
      const serviceId = booking.service.id;
      if (!serviceStats[serviceId]) {
        serviceStats[serviceId] = {
          serviceName: booking.service.name,
          count: 0,
          revenue: 0,
        };
      }
      serviceStats[serviceId].count++;
      if (booking.status === BookingStatus.COMPLETED) {
        serviceStats[serviceId].revenue += Number(booking.totalAmount);
      }
    });

    // Get most popular service
    const popularServices = Object.entries(serviceStats)
      .map(([id, stats]) => ({ serviceId: id, ...stats }))
      .sort((a, b) => b.count - a.count);

    return {
      period: {
        startDate,
        endDate,
      },
      overview: {
        totalBookings,
        totalRevenue,
        averageBookingValue:
          completedBookings.length > 0
            ? totalRevenue / completedBookings.length
            : 0,
      },
      byStatus,
      topServices: popularServices.slice(0, 5),
    };
  }

  // ─── Business Hours ──────────────────────────────────────────────────────────

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
    // Upsert each day — unique on dayOfWeek
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

  // ─── Business Exceptions ─────────────────────────────────────────────────────

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
    // Normalize to start of day UTC to avoid time-zone drift on uniqueness
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
