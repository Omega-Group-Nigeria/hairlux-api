import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from '../payment/paystack.service';
import { MonnifyService } from '../payment/monnify.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../redis/redis.service';
import { DiscountService } from '../discount/discount.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingPaymentPayloadDto } from './dto/booking-payment-payload.dto';
import { InitializeBookingPaymentDto } from './dto/initialize-booking-payment.dto';
import { VerifyBookingPaymentDto } from './dto/verify-booking-payment.dto';
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
  BookingType,
} from '@prisma/client';
import { createHash } from 'crypto';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private paystackService: PaystackService,
    private monnifyService: MonnifyService,
    private mailService: MailService,
    private redis: RedisService,
    private discountService: DiscountService,
  ) {}

  // ─── Reservation code generator ─────────────────────────────────────────
  // Avoids visually ambiguous chars (0, O, 1, I)
  private readonly CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private generateCode(length = 4): string {
    let code = '';
    for (let i = 0; i < length; i++) {
      code +=
        this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
    }
    return `HLX-${code}`;
  }

  private async generateReservationCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.generateCode();
      const existing = await this.prisma.booking.findUnique({
        where: { reservationCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('Could not generate a unique reservation code');
  }

  private resolvePriceForBookingType(
    service: {
      name: string;
      walkInPrice: { toNumber: () => number } | number;
      homeServicePrice: { toNumber: () => number } | number;
      isWalkInAvailable: boolean;
      isHomeServiceAvailable: boolean;
    },
    bookingType: BookingType,
  ): number {
    if (bookingType === BookingType.WALK_IN) {
      if (!service.isWalkInAvailable) {
        throw new BadRequestException(
          `Service "${service.name}" is not available for WALK_IN bookings`,
        );
      }

      return typeof service.walkInPrice === 'number'
        ? service.walkInPrice
        : service.walkInPrice.toNumber();
    }

    if (!service.isHomeServiceAvailable) {
      throw new BadRequestException(
        `Service "${service.name}" is not available for HOME_SERVICE bookings`,
      );
    }

    return typeof service.homeServicePrice === 'number'
      ? service.homeServicePrice
      : service.homeServicePrice.toNumber();
  }

  private formatBookingAddress(address: unknown) {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
      return null;
    }

    const raw = address as Record<string, unknown>;
    return {
      id: raw.id,
      fullAddress: raw.fullAddress ?? null,
      streetAddress: raw.streetAddress ?? null,
      city: raw.city ?? null,
      state: raw.state ?? null,
      country: raw.country ?? null,
      placeId: raw.placeId ?? null,
      addressComponents: raw.addressComponents ?? null,
      isDefault: raw.isDefault ?? false,
    };
  }

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
    const {
      services,
      date,
      time,
      addressId,
      bookingType,
      guestName,
      guestPhone,
      guestEmail,
      paymentMethod,
      discountCode,
    } = createBookingDto;

    // Validate address — only required for HOME_SERVICE
    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (bookingType === BookingType.HOME_SERVICE) {
      address = await this.prisma.address.findFirst({
        where: { id: addressId, userId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }
    }

    // Fetch user once for confirmation email
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const bookingDate = new Date(`${date}T${time}`);

    // Validate every service up-front before touching anything
    const serviceRecords: {
      serviceId: string;
      name: string;
      price: number;
      duration: number;
      notes?: string;
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
        name: service.name,
        price: this.resolvePriceForBookingType(service, bookingType),
        duration: service.duration ?? 0,
        ...(item.notes ? { notes: item.notes } : {}),
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

    // ONE reservation code for the entire booking
    const reservationCode = await this.generateReservationCode();

    const totalAmount = serviceRecords.reduce((sum, s) => sum + s.price, 0);

    // ── Discount code validation ──────────────────────────────────────────────
    let validatedDiscount: {
      id: string;
      code: string;
      name: string;
      percentage: number;
    } | null = null;
    let discountAmount = 0;
    let finalAmount = totalAmount;

    if (discountCode) {
      validatedDiscount = await this.discountService.validate(
        discountCode,
        userId,
      ); // Validate ownership
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    const serviceNames = serviceRecords.map((s) => s.name).join(', ');

    // ── WALLET: check balance then create + pay atomically ───────────────────
    if (paymentMethod === PaymentMethod.WALLET) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      if (Number(wallet.balance) < finalAmount) {
        throw new BadRequestException(
          `Insufficient wallet balance. Required: ${finalAmount}, Available: ${Number(wallet.balance)}`,
        );
      }

      const walletResult = await this.prisma.$transaction(async (tx) => {
        // Debit wallet
        await tx.wallet.update({
          where: { userId },
          data: { balance: { decrement: finalAmount } },
        });

        // Create ONE booking record with all services as JSON
        const booking = await tx.booking.create({
          data: {
            userId,
            services: serviceRecords,
            addressId: addressId ?? null,
            bookingDate,
            bookingTime: time,
            bookingType,
            reservationCode,
            guestName: guestName ?? null,
            guestPhone: guestPhone ?? null,
            guestEmail: guestEmail ?? null,
            totalAmount: finalAmount,
            paymentMethod: PaymentMethod.WALLET,
            status: BookingStatus.CONFIRMED,
          },
          include: {
            address: true,
          },
        });

        // Single transaction record for the whole booking
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: finalAmount,
            type: TransactionType.DEBIT,
            paymentMethod: 'WALLET',
            description: `Payment for: ${serviceNames}${validatedDiscount ? ` (${validatedDiscount.percentage}% discount applied)` : ''}`,
            reference: `BOOK-${booking.id}-${Date.now()}`,
            status: TransactionStatus.COMPLETED,
          },
        });

        // Track discount usage
        let discountUsageId: string | null = null;
        if (validatedDiscount) {
          const usage = await tx.discountUsage.create({
            data: {
              discountCodeId: validatedDiscount.id,
              userId,
              bookingId: booking.id,
              discountAmount,
            },
          });
          discountUsageId = usage.id;
        }

        return { booking, discountUsageId };
      });

      const { booking, discountUsageId } = walletResult;

      // Queue emails (non-blocking — void fires and forgets into Bull queue)
      const addressStr = address
        ? address.fullAddress
        : 'In-store (Walk-in)';
      const emailServices = serviceRecords.map((s) => ({
        name: s.name,
        price: s.price,
        duration: s.duration,
      }));

      if (user) {
        void this.mailService.sendBookingConfirmationEmail(
          user.email,
          user.firstName,
          {
            services: emailServices,
            date,
            time,
            address: addressStr,
            totalAmount: finalAmount,
            paymentMethod: 'WALLET',
            bookingIds: [booking.id],
            reservationCode,
          },
        );
      }

      if (guestEmail && guestName && user) {
        void this.mailService.sendGuestBookingEmail(guestEmail, guestName, {
          services: emailServices,
          date,
          time,
          address: addressStr,
          totalAmount: finalAmount,
          reservationCode,
          bookedByName: `${user.firstName} ${user.lastName}`.trim(),
        });
      }

      // Invalidate analytics + wallet balance (wallet debited)
      void Promise.all([
        this.redis.delByPattern('analytics:*'),
        this.redis.del(`wallet:balance:${userId}`),
      ]);

      // Non-fatal: increment usage count (reward triggered on COMPLETED, not on create)
      if (validatedDiscount && discountUsageId) {
        void (async () => {
          try {
            await this.discountService.incrementUsage(validatedDiscount!.code);
          } catch (e) {
            this.logger.warn(
              `incrementUsage failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        })();
      }

      return {
        booking: {
          ...booking,
          services: serviceRecords,
          totalAmount: finalAmount,
        },
        reservationCode,
        totalAmount: finalAmount,
        originalAmount: validatedDiscount ? totalAmount : undefined,
        discountApplied: validatedDiscount
          ? {
              code: validatedDiscount.code,
              percentage: validatedDiscount.percentage,
              amount: discountAmount,
            }
          : undefined,
        paymentMethod: PaymentMethod.WALLET,
        message: 'Payment successful. Booking confirmed.',
      };
    }

    // ── CASH: create booking as PENDING, collect on delivery ─────────────────
    const booking = await this.prisma.$transaction(async (tx) => {
      return tx.booking.create({
        data: {
          userId,
          services: serviceRecords,
          addressId: addressId ?? null,
          bookingDate,
          bookingTime: time,
          bookingType,
          reservationCode,
          guestName: guestName ?? null,
          guestPhone: guestPhone ?? null,
          guestEmail: guestEmail ?? null,
          totalAmount: finalAmount,
          paymentMethod: PaymentMethod.CASH,
          status: BookingStatus.PENDING,
        },
        include: {
          address: true,
        },
      });
    });

    // Queue emails (non-blocking — void fires and forgets into Bull queue)
    const addressStr = address
      ? address.fullAddress
      : 'In-store (Walk-in)';
    const emailServices = serviceRecords.map((s) => ({
      name: s.name,
      price: s.price,
      duration: s.duration,
    }));

    if (user) {
      void this.mailService.sendBookingConfirmationEmail(
        user.email,
        user.firstName,
        {
          services: emailServices,
          date,
          time,
          address: addressStr,
          totalAmount: finalAmount,
          paymentMethod: 'CASH',
          bookingIds: [booking.id],
          reservationCode,
        },
      );
    }

    if (guestEmail && guestName && user) {
      void this.mailService.sendGuestBookingEmail(guestEmail, guestName, {
        services: emailServices,
        date,
        time,
        address: addressStr,
        totalAmount: finalAmount,
        reservationCode,
        bookedByName: `${user.firstName} ${user.lastName}`.trim(),
      });
    }

    // Non-fatal: track discount usage + increment (reward triggered on COMPLETED, not on create)
    if (validatedDiscount) {
      void (async () => {
        try {
          await this.prisma.discountUsage.create({
            data: {
              discountCodeId: validatedDiscount!.id,
              userId,
              bookingId: booking.id,
              discountAmount,
            },
          });
          await this.discountService.incrementUsage(validatedDiscount!.code);
        } catch (e) {
          this.logger.warn(
            `Discount post-processing failed (CASH, non-fatal): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    }

    // Invalidate analytics (new booking added)
    void this.redis.delByPattern('analytics:*');

    return {
      booking: {
        ...booking,
        services: serviceRecords,
        totalAmount: finalAmount,
      },
      reservationCode,
      totalAmount: finalAmount,
      originalAmount: validatedDiscount ? totalAmount : undefined,
      discountApplied: validatedDiscount
        ? {
            code: validatedDiscount.code,
            percentage: validatedDiscount.percentage,
            amount: discountAmount,
          }
        : undefined,
      paymentMethod: PaymentMethod.CASH,
      message: 'Booking reserved. Payment will be collected on delivery.',
    };
  }

  private buildBookingPaymentReference(userId: string, idempotencyKey: string) {
    const digest = createHash('sha256')
      .update(`${userId}:${idempotencyKey.trim()}`)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();
    return `BOOKPAY-MONF-${digest}`;
  }

  private async getOrCreateWallet(userId: string) {
    return this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: 0,
      },
    });
  }

  private async prepareBookingPaymentContext(
    userId: string,
    payload: BookingPaymentPayloadDto,
    checkSlotAvailability = true,
  ) {
    const {
      services,
      date,
      time,
      addressId,
      bookingType,
      discountCode,
    } = payload;

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (bookingType === BookingType.HOME_SERVICE) {
      address = await this.prisma.address.findFirst({
        where: { id: addressId, userId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const bookingDate = new Date(`${date}T${time}`);

    const serviceRecords: {
      serviceId: string;
      name: string;
      price: number;
      duration: number;
      notes?: string;
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
        name: service.name,
        price: this.resolvePriceForBookingType(service, bookingType),
        duration: service.duration ?? 0,
        ...(item.notes ? { notes: item.notes } : {}),
      });
    }

    if (checkSlotAvailability) {
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
    }

    const totalAmount = serviceRecords.reduce((sum, s) => sum + s.price, 0);

    let validatedDiscount: {
      id: string;
      code: string;
      name: string;
      percentage: number;
    } | null = null;
    let discountAmount = 0;
    let finalAmount = totalAmount;

    if (discountCode) {
      validatedDiscount = await this.discountService.validate(discountCode, userId);
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    return {
      user,
      address,
      bookingDate,
      serviceRecords,
      totalAmount,
      finalAmount,
      discountAmount,
      validatedDiscount,
    };
  }

  async initializeBookingPayment(
    userId: string,
    dto: InitializeBookingPaymentDto,
  ) {
    if (dto.provider !== 'monnify') {
      throw new BadRequestException('Only monnify is supported for booking payments');
    }

    const context = await this.prepareBookingPaymentContext(
      userId,
      dto.bookingPayload,
      true,
    );

    const wallet = await this.getOrCreateWallet(userId);
    const walletBalance = Number(wallet.balance);
    const walletContribution = Math.min(walletBalance, context.finalAmount);
    const requiredExternalAmount = Math.max(
      0,
      Math.round((context.finalAmount - walletContribution) * 100) / 100,
    );

    if (requiredExternalAmount <= 0) {
      throw new BadRequestException(
        'Wallet balance is sufficient. Complete this booking with WALLET payment.',
      );
    }

    if (Math.abs(Number(dto.amount) - requiredExternalAmount) > 0.001) {
      throw new BadRequestException(
        `Amount mismatch. Expected wallet shortfall ${requiredExternalAmount}, got ${dto.amount}`,
      );
    }

    const bookingPaymentReference = this.buildBookingPaymentReference(
      userId,
      dto.idempotencyKey,
    );

    const existingIntent = await this.prisma.transaction.findFirst({
      where: {
        reference: bookingPaymentReference,
        type: TransactionType.BOOKING_PAYMENT,
        wallet: { userId },
      },
    });

    if (existingIntent) {
      const metadata = (existingIntent.metadata as Record<string, any> | null) ?? {};
      return {
        paymentUrl: metadata.checkoutUrl ?? null,
        checkoutUrl: metadata.checkoutUrl ?? null,
        bookingPaymentReference,
        gatewayReference: metadata.monnifyTransactionReference ?? null,
        expiresAt: metadata.expiresAt ?? null,
        status: existingIntent.status,
        walletContribution:
          typeof metadata.walletContribution === 'number'
            ? metadata.walletContribution
            : null,
        amountToPay: Number(existingIntent.amount),
      };
    }

    const monnifyData = await this.monnifyService.initializePayment(
      context.user.email,
      requiredExternalAmount,
      bookingPaymentReference,
      `${context.user.firstName} ${context.user.lastName}`.trim(),
    );

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    await this.prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount: requiredExternalAmount,
        type: TransactionType.BOOKING_PAYMENT,
        status: TransactionStatus.PENDING,
        paymentMethod: 'MONNIFY',
        reference: bookingPaymentReference,
        description: 'Booking payment intent via Monnify',
        metadata: {
          purpose: 'BOOKING_PAYMENT',
          provider: 'monnify',
          idempotencyKey: dto.idempotencyKey,
          bookingPayload: dto.bookingPayload,
          originalAmount: context.totalAmount,
          finalAmount: context.finalAmount,
          walletBalanceAtInit: walletBalance,
          walletContribution,
          amountToPay: requiredExternalAmount,
          discountApplied: context.validatedDiscount
            ? {
                code: context.validatedDiscount.code,
                percentage: context.validatedDiscount.percentage,
                amount: context.discountAmount,
              }
            : null,
          monnifyTransactionReference:
            monnifyData.responseBody.transactionReference,
          monnifyPaymentReference: monnifyData.responseBody.paymentReference,
          checkoutUrl: monnifyData.responseBody.checkoutUrl,
          expiresAt,
        } as any,
      },
    });

    return {
      paymentUrl: monnifyData.responseBody.checkoutUrl,
      checkoutUrl: monnifyData.responseBody.checkoutUrl,
      bookingPaymentReference,
      gatewayReference: monnifyData.responseBody.transactionReference,
      expiresAt,
      walletContribution,
      amountToPay: requiredExternalAmount,
      totalAmount: context.finalAmount,
    };
  }

  async verifyBookingPayment(userId: string, dto: VerifyBookingPaymentDto) {
    if (dto.provider !== 'monnify') {
      throw new BadRequestException('Only monnify is supported for booking payments');
    }

    const paymentIntent = await this.prisma.transaction.findFirst({
      where: {
        reference: dto.bookingPaymentReference,
        type: TransactionType.BOOKING_PAYMENT,
        wallet: { userId },
      },
    });

    if (!paymentIntent) {
      throw new NotFoundException('Booking payment reference not found');
    }

    const metadata =
      (paymentIntent.metadata as Record<string, any> | null) ?? {};

    if (paymentIntent.status === TransactionStatus.COMPLETED && metadata.bookingId) {
      const existingBooking = await this.prisma.booking.findFirst({
        where: { id: String(metadata.bookingId), userId },
        include: { address: true },
      });

      if (existingBooking) {
        return {
          booking: {
            ...existingBooking,
            totalAmount: Number(existingBooking.totalAmount),
            address: this.formatBookingAddress(existingBooking.address),
          },
          reservationCode:
            String(metadata.reservationCode ?? existingBooking.reservationCode),
          message: 'Booking payment already verified',
        };
      }
    }

    const monnifyTransactionReference = metadata.monnifyTransactionReference;
    if (!monnifyTransactionReference) {
      throw new BadRequestException(
        'Gateway reference missing for this booking payment',
      );
    }

    const verification = await this.monnifyService.verifyPayment(
      String(monnifyTransactionReference),
    );

    if (verification.responseBody.paymentStatus !== 'PAID') {
      await this.prisma.transaction.update({
        where: { id: paymentIntent.id },
        data: {
          status: TransactionStatus.FAILED,
          metadata: {
            ...metadata,
            paymentStatus: verification.responseBody.paymentStatus,
          } as any,
        },
      });

      throw new BadRequestException(
        `Payment not completed. Status: ${verification.responseBody.paymentStatus}`,
      );
    }

    const paidAmount = Number(verification.responseBody.amountPaid);
    const expectedAmount = Number(paymentIntent.amount);
    if (
      !Number.isFinite(paidAmount) ||
      Math.abs(paidAmount - expectedAmount) > 0.001
    ) {
      throw new BadRequestException('Payment amount mismatch');
    }

    const payload = metadata.bookingPayload as BookingPaymentPayloadDto | undefined;
    if (!payload) {
      throw new BadRequestException('Booking payload missing for this payment');
    }

    const context = await this.prepareBookingPaymentContext(userId, payload, true);
    const expectedWalletContribution = Number(metadata.walletContribution ?? 0);
    const expectedTotalFromParts =
      Math.round((expectedAmount + expectedWalletContribution) * 100) / 100;
    if (Math.abs(context.finalAmount - expectedTotalFromParts) > 0.001) {
      throw new BadRequestException(
        `Current booking amount (${context.finalAmount}) no longer matches initialized split (${expectedTotalFromParts})`,
      );
    }

    const reservationCode = await this.generateReservationCode();
    const addressLabel = context.address
      ? context.address.fullAddress
      : 'In-store (Walk-in)';

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedIntent = await tx.transaction.findUnique({
        where: { id: paymentIntent.id },
      });
      const lockedMetadata =
        (lockedIntent?.metadata as Record<string, any> | null) ?? {};

      const walletContributionToDebit = Number(
        lockedMetadata.walletContribution ?? 0,
      );

      if (lockedIntent?.status === TransactionStatus.COMPLETED && lockedMetadata.bookingId) {
        const existingBooking = await tx.booking.findUnique({
          where: { id: String(lockedMetadata.bookingId) },
          include: { address: true },
        });

        return {
          booking: existingBooking,
          reservationCode: String(
            lockedMetadata.reservationCode ?? existingBooking?.reservationCode,
          ),
          discountUsageId: null as string | null,
        };
      }

      if (walletContributionToDebit > 0) {
        const wallet = await tx.wallet.findUnique({
          where: { id: paymentIntent.walletId },
        });

        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }

        if (Number(wallet.balance) < walletContributionToDebit) {
          throw new BadRequestException(
            `Wallet balance changed before verification. Needed ${walletContributionToDebit}, available ${Number(wallet.balance)}`,
          );
        }

        await tx.wallet.update({
          where: { id: paymentIntent.walletId },
          data: {
            balance: {
              decrement: walletContributionToDebit,
            },
          },
        });
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          services: context.serviceRecords,
          addressId: payload.addressId ?? null,
          bookingDate: context.bookingDate,
          bookingTime: payload.time,
          bookingType: payload.bookingType,
          reservationCode,
          guestName: payload.guestName ?? null,
          guestPhone: payload.guestPhone ?? null,
          guestEmail: payload.guestEmail ?? null,
          totalAmount: context.finalAmount,
          paymentMethod: PaymentMethod.MONNIFY,
          status: BookingStatus.CONFIRMED,
          notes:
            `Paid online via MONNIFY (${dto.bookingPaymentReference})` +
            (addressLabel ? ` | ${addressLabel}` : ''),
        },
        include: {
          address: true,
        },
      });

      let discountUsageId: string | null = null;

      if (walletContributionToDebit > 0) {
        await tx.transaction.create({
          data: {
            walletId: paymentIntent.walletId,
            amount: walletContributionToDebit,
            type: TransactionType.DEBIT,
            paymentMethod: 'WALLET',
            reference: `BOOK-WAL-${booking.id}`,
            description: `Wallet contribution for booking payment ${dto.bookingPaymentReference}`,
            status: TransactionStatus.COMPLETED,
            metadata: {
              purpose: 'BOOKING_PAYMENT_WALLET_CONTRIBUTION',
              bookingId: booking.id,
              bookingPaymentReference: dto.bookingPaymentReference,
            } as any,
          },
        });
      }

      if (context.validatedDiscount) {
        const usage = await tx.discountUsage.create({
          data: {
            discountCodeId: context.validatedDiscount.id,
            userId,
            bookingId: booking.id,
            discountAmount: context.discountAmount,
          },
        });
        discountUsageId = usage.id;
      }

      await tx.transaction.update({
        where: { id: paymentIntent.id },
        data: {
          status: TransactionStatus.COMPLETED,
          metadata: {
            ...lockedMetadata,
            ...verification.responseBody,
            provider: 'monnify',
            purpose: 'BOOKING_PAYMENT',
            bookingId: booking.id,
            reservationCode,
            walletContributionUsed: walletContributionToDebit,
            verifiedAt: new Date().toISOString(),
          } as any,
        },
      });

      return {
        booking,
        reservationCode,
        discountUsageId,
      };
    });

    if (!result.booking) {
      throw new ConflictException('Booking payment already processed');
    }

    const emailServices = context.serviceRecords.map((s) => ({
      name: s.name,
      price: s.price,
      duration: s.duration,
    }));

    void this.mailService.sendBookingConfirmationEmail(
      context.user.email,
      context.user.firstName,
      {
        services: emailServices,
        date: payload.date,
        time: payload.time,
        address: addressLabel,
        totalAmount: context.finalAmount,
        paymentMethod: 'MONNIFY',
        bookingIds: [result.booking.id],
        reservationCode: result.reservationCode,
      },
    );

    if (payload.guestEmail && payload.guestName) {
      void this.mailService.sendGuestBookingEmail(payload.guestEmail, payload.guestName, {
        services: emailServices,
        date: payload.date,
        time: payload.time,
        address: addressLabel,
        totalAmount: context.finalAmount,
        reservationCode: result.reservationCode,
        bookedByName: `${context.user.firstName} ${context.user.lastName}`.trim(),
      });
    }

    if (context.validatedDiscount && result.discountUsageId) {
      void (async () => {
        try {
          await this.discountService.incrementUsage(context.validatedDiscount!.code);
        } catch (e) {
          this.logger.warn(
            `incrementUsage failed (booking payment, non-fatal): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    }

    void this.redis.delByPattern('analytics:*');
    if (expectedWalletContribution > 0) {
      void this.redis.del(`wallet:balance:${userId}`);
    }

    return {
      booking: {
        ...result.booking,
        totalAmount: Number(result.booking.totalAmount),
        address: this.formatBookingAddress(result.booking.address),
      },
      reservationCode: result.reservationCode,
      message: 'Booking payment verified and booking created',
    };
  }

  async verifyBookingPaymentByReference(bookingPaymentReference: string) {
    const paymentIntent = await this.prisma.transaction.findFirst({
      where: {
        reference: bookingPaymentReference,
        type: TransactionType.BOOKING_PAYMENT,
      },
      include: {
        wallet: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!paymentIntent) {
      return { status: 'not_found', bookingPaymentReference };
    }

    const result = await this.verifyBookingPayment(paymentIntent.wallet.userId, {
      bookingPaymentReference,
      provider: 'monnify',
    });

    return {
      status: 'processed',
      bookingPaymentReference,
      reservationCode: result.reservationCode,
      bookingId: result.booking.id,
    };
  }

  async getBookingPaymentStatus(userId: string, bookingPaymentReference: string) {
    const paymentIntent = await this.prisma.transaction.findFirst({
      where: {
        reference: bookingPaymentReference,
        type: TransactionType.BOOKING_PAYMENT,
        wallet: { userId },
      },
    });

    if (!paymentIntent) {
      throw new NotFoundException('Booking payment reference not found');
    }

    const metadata =
      (paymentIntent.metadata as Record<string, any> | null) ?? {};

    const bookingId =
      typeof metadata.bookingId === 'string' ? metadata.bookingId : null;
    const linkedBooking = bookingId
      ? await this.prisma.booking.findFirst({
          where: { id: bookingId, userId },
          select: {
            id: true,
            reservationCode: true,
            status: true,
            totalAmount: true,
            bookingDate: true,
            bookingTime: true,
          },
        })
      : null;

    return {
      bookingPaymentReference,
      provider: metadata.provider ?? 'monnify',
      status: paymentIntent.status,
      amount: Number(paymentIntent.amount),
      gatewayReference: metadata.monnifyTransactionReference ?? null,
      paymentReference: metadata.monnifyPaymentReference ?? null,
      expiresAt: metadata.expiresAt ?? null,
      booking: linkedBooking
        ? {
            ...linkedBooking,
            totalAmount: Number(linkedBooking.totalAmount),
          }
        : null,
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
        address: true,
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
        address: true,
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
        address: true,
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
              paymentMethod: 'WALLET',
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
        address: this.formatBookingAddress(booking.address),
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
        address: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return {
      ...booking,
      totalAmount: Number(booking.totalAmount),
      address: this.formatBookingAddress(booking.address),
    };
  }

  async createAdminBooking(createDto: AdminCreateBookingDto) {
    const {
      userId,
      services,
      addressId,
      bookingType,
      guestName,
      guestPhone,
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

    // Validate all requested services and build JSON records
    const serviceRecords: {
      serviceId: string;
      name: string;
      price: number;
      duration: number;
      notes?: string;
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
        name: service.name,
        price: this.resolvePriceForBookingType(service, bookingType),
        duration: service.duration,
        ...(item.notes ? { notes: item.notes } : {}),
      });
    }

    const totalAmount = serviceRecords.reduce((sum, s) => sum + s.price, 0);

    // Verify address — only required for HOME_SERVICE
    let address: Awaited<
      ReturnType<typeof this.prisma.address.findUnique>
    > | null = null;
    if (bookingType === BookingType.HOME_SERVICE) {
      address = await this.prisma.address.findUnique({
        where: { id: addressId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }

      if (address.userId !== userId) {
        throw new BadRequestException('Address does not belong to user');
      }
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

    const status = paymentMethod
      ? BookingStatus.CONFIRMED
      : BookingStatus.PENDING;

    const reservationCode = await this.generateReservationCode();

    const booking = await this.prisma.booking.create({
      data: {
        userId,
        services: serviceRecords,
        addressId: addressId ?? null,
        bookingDate: new Date(bookingDate),
        bookingTime,
        bookingType,
        reservationCode,
        guestName: guestName ?? null,
        guestPhone: guestPhone ?? null,
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
        address: true,
      },
    });

    // Process payment if method specified (walk-in)
    if (paymentMethod) {
      if (paymentMethod === PaymentMethod.WALLET) {
        const wallet = await this.prisma.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }

        if (Number(wallet.balance) < totalAmount) {
          throw new BadRequestException(
            `Insufficient wallet balance. Required: ${totalAmount}, Available: ${Number(wallet.balance)}`,
          );
        }

        await this.prisma.$transaction([
          this.prisma.wallet.update({
            where: { userId },
            data: { balance: { decrement: totalAmount } },
          }),
          this.prisma.transaction.create({
            data: {
              walletId: wallet.id,
              type: TransactionType.DEBIT,
              paymentMethod: 'WALLET',
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
      services: serviceRecords,
      reservationCode,
      address: this.formatBookingAddress(booking.address),
    };
  }

  async updateStatusAdmin(id: string, status: BookingStatus) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        user: true,
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
              paymentMethod: 'WALLET',
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

    // Trigger influencer reward when booking reaches COMPLETED
    if (status === BookingStatus.COMPLETED) {
      void (async () => {
        try {
          const usage = await this.prisma.discountUsage.findUnique({
            where: { bookingId: id },
          });
          if (usage) {
            await this.discountService.processInfluencerReward(
              usage.id,
              Number(booking.totalAmount),
            );
          }
        } catch (e) {
          this.logger.warn(
            `processInfluencerReward (COMPLETED) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    }

    return {
      ...result,
      totalAmount: Number(result.totalAmount),
      address: this.formatBookingAddress(result.address),
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
        services: booking.services,
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

    const allTime = !startDate && !endDate;

    let start: Date | undefined;
    let end: Date | undefined;

    if (!allTime) {
      if (!startDate || !endDate) {
        throw new BadRequestException(
          'Both startDate and endDate are required, or omit both for all-time stats',
        );
      }
      start = new Date(startDate);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (start > end) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    // Get bookings — full table scan when allTime, date-filtered otherwise
    const bookings = await this.prisma.booking.findMany({
      where: allTime ? {} : { bookingDate: { gte: start, lte: end } },
    });

    // Calculate stats
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter(
      (b) => b.status === BookingStatus.COMPLETED,
    );
    // Revenue = any booking that has been paid (CONFIRMED, IN_PROGRESS, COMPLETED)
    // PENDING = cash not yet collected; CANCELLED = refunded / never paid
    const paidStatuses: BookingStatus[] = [
      BookingStatus.CONFIRMED,
      BookingStatus.IN_PROGRESS,
      BookingStatus.COMPLETED,
    ];
    const paidBookings = bookings.filter((b) =>
      paidStatuses.includes(b.status),
    );
    const totalRevenue = paidBookings.reduce(
      (sum, b) => sum + Number(b.totalAmount),
      0,
    );

    // Group by status
    const byStatus = {
      pending: bookings.filter((b) => b.status === BookingStatus.PENDING)
        .length,
      confirmed: bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
        .length,
      inProgress: bookings.filter((b) => b.status === BookingStatus.IN_PROGRESS)
        .length,
      completed: completedBookings.length,
      cancelled: bookings.filter((b) => b.status === BookingStatus.CANCELLED)
        .length,
    };

    // Group by service — count all bookings; revenue only from paid ones
    const serviceStats: Record<string, any> = {};
    bookings.forEach((booking) => {
      const isPaid = paidBookings.includes(booking);
      (booking.services as any[]).forEach((svc) => {
        const svcId = svc.serviceId;
        if (!serviceStats[svcId]) {
          serviceStats[svcId] = {
            serviceName: svc.name,
            count: 0,
            revenue: 0,
          };
        }
        serviceStats[svcId].count++;
        if (isPaid) {
          serviceStats[svcId].revenue += Number(svc.price);
        }
      });
    });

    // Get most popular service
    const popularServices = Object.entries(serviceStats)
      .map(([id, stats]) => ({ serviceId: id, ...stats }))
      .sort((a, b) => b.count - a.count);

    return {
      period: allTime
        ? { allTime: true }
        : { allTime: false, startDate, endDate },
      overview: {
        totalBookings,
        totalRevenue,
        averageBookingValue:
          paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
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

  // ─── Reservation Code Lookup ───────────────────────────────────────────────

  /**
   * User-facing: look up a booking by reservation code.
   * Only returns the booking if it belongs to the requesting user.
   */
  async findByReservationCode(code: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
      include: {
        address: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    if (booking.userId !== userId) {
      throw new ForbiddenException('This reservation does not belong to you');
    }

    return booking;
  }

  /**
   * Admin-facing: look up a booking by reservation code with full validity info.
   */
  async adminFindByReservationCode(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
      include: {
        address: true,
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
      throw new NotFoundException('Reservation code not found');
    }

    return {
      ...booking,
      address: this.formatBookingAddress(booking.address),
      isValid:
        !booking.reservationUsed && booking.status !== BookingStatus.CANCELLED,
    };
  }

  /**
   * Admin-facing: mark a reservation as used. Irreversible.
   * Returns 409 if already used or cancelled.
   */
  async useReservation(code: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { reservationCode: code.toUpperCase() },
    });

    if (!booking) {
      throw new NotFoundException('Reservation code not found');
    }

    if (booking.reservationUsed) {
      throw new ConflictException('This reservation has already been used');
    }

    if (booking.status === BookingStatus.CANCELLED) {
      throw new ConflictException(
        'This reservation is cancelled and cannot be used',
      );
    }

    const updated = await this.prisma.booking.update({
      where: { reservationCode: code.toUpperCase() },
      data: {
        reservationUsed: true,
        // WALK_IN: customer is present, service rendered immediately → COMPLETED
        // HOME_SERVICE: stylist is on the way / just arrived → IN_PROGRESS
        status:
          booking.bookingType === BookingType.WALK_IN
            ? BookingStatus.COMPLETED
            : BookingStatus.IN_PROGRESS,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
        address: true,
      },
    });

    void this.redis.delByPattern('analytics:*');

    // For WALK_IN bookings, status becomes COMPLETED immediately — trigger reward
    if (
      booking.bookingType === BookingType.WALK_IN &&
      updated.status === BookingStatus.COMPLETED
    ) {
      void (async () => {
        try {
          const usage = await this.prisma.discountUsage.findUnique({
            where: { bookingId: booking.id },
          });
          if (usage) {
            await this.discountService.processInfluencerReward(
              usage.id,
              Number(booking.totalAmount),
            );
          }
        } catch (e) {
          this.logger.warn(
            `processInfluencerReward (useReservation) failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      })();
    }

    return {
      ...updated,
      address: this.formatBookingAddress(updated.address),
    };
  }
}
