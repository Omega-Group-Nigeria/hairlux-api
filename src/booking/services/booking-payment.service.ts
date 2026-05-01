import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  BookingType,
  DiscountType,
  PaymentMethod,
  Prisma,
  ReferralRewardType,
  ReferralStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { createHash } from 'crypto';
import { DiscountService } from '../../discount/discount.service';
import { MailService } from '../../mail/mail.service';
import { MonnifyService } from '../../payment/monnify.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { BookingPaymentPayloadDto } from '../dto/booking-payment-payload.dto';
import {
  CreateBookingDto,
  ServiceBookingItemDto,
} from '../dto/create-booking.dto';
import { InitializeBookingPaymentDto } from '../dto/initialize-booking-payment.dto';
import { VerifyBookingPaymentDto } from '../dto/verify-booking-payment.dto';
import {
  formatBookingAddress,
  resolvePriceForBookingType,
} from '../utils/booking.utils';
import { BookingWalletService } from './booking-wallet.service';
import { ReservationService } from './reservation.service';

@Injectable()
export class BookingPaymentService {
  constructor(
    private prisma: PrismaService,
    private monnifyService: MonnifyService,
    private mailService: MailService,
    private redis: RedisService,
    private discountService: DiscountService,
    private bookingWalletService: BookingWalletService,
    private reservationService: ReservationService,
  ) {}

  private resolveServiceMode(
    item: Pick<ServiceBookingItemDto, 'serviceMode' | 'serviceId'>,
    fallbackBookingType?: BookingType,
  ): BookingType {
    const resolvedMode = item.serviceMode ?? fallbackBookingType;

    if (
      resolvedMode !== BookingType.HOME_SERVICE &&
      resolvedMode !== BookingType.WALK_IN
    ) {
      throw new BadRequestException(
        `Service ${item.serviceId} is missing serviceMode. Provide serviceMode per item (HOME_SERVICE or WALK_IN), or use legacy bookingType for all services.`,
      );
    }

    return resolvedMode;
  }

  private deriveBookingTypeFromServiceRecords(
    serviceRecords: Array<{ serviceMode: BookingType }>,
  ): BookingType {
    const modeSet = new Set(
      serviceRecords.map((service) => service.serviceMode),
    );
    if (modeSet.size > 1) {
      return BookingType.MIXED;
    }

    return serviceRecords[0]?.serviceMode ?? BookingType.WALK_IN;
  }

  private normalizeIdempotencyKey(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isUniqueConstraintError(err: unknown, field: string): boolean {
    if (typeof err !== 'object' || err === null) return false;
    if (!('code' in err) || (err as { code?: string }).code !== 'P2002') {
      return false;
    }

    const fieldSnake = field.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const target = (err as { meta?: { target?: string[] | string } }).meta
      ?.target;
    if (Array.isArray(target)) {
      return target.includes(field) || target.includes(fieldSnake);
    }
    if (typeof target === 'string') {
      return target.includes(field) || target.includes(fieldSnake);
    }
    return false;
  }

  private async findBookingByIdempotencyKey(
    userId: string,
    idempotencyKey: string,
  ) {
    return this.prisma.booking.findFirst({
      where: { userId, idempotencyKey },
      include: {
        address: true,
        discountUsage: {
          include: {
            discountCode: true,
          },
        },
      },
    });
  }

  private buildCreateResponseFromBooking(
    booking: Prisma.BookingGetPayload<{
      include: {
        address: true;
        discountUsage: { include: { discountCode: true } };
      };
    }>,
  ) {
    const totalAmount = Number(booking.totalAmount);
    const discountAmount = booking.discountUsage
      ? Number(booking.discountUsage.discountAmount)
      : 0;

    const discountApplied = booking.discountUsage
      ? {
          code: booking.discountUsage.discountCode.code,
          percentage: booking.discountUsage.discountCode.percentage,
          amount: discountAmount,
        }
      : undefined;

    const originalAmount = booking.discountUsage
      ? Math.round((totalAmount + discountAmount) * 100) / 100
      : undefined;

    const message =
      booking.paymentMethod === PaymentMethod.WALLET
        ? 'Payment successful. Booking confirmed.'
        : 'Booking reserved. Payment will be collected on delivery.';

    return {
      booking: {
        ...booking,
        services: booking.services,
        totalAmount,
      },
      reservationCode: booking.reservationCode,
      totalAmount,
      originalAmount,
      discountApplied,
      paymentMethod: booking.paymentMethod,
      message,
    };
  }

  private buildVerifyResponseFromBooking(
    booking: Prisma.BookingGetPayload<{
      include: { address: true };
    }>,
    reservationCode: string,
  ) {
    return {
      booking: {
        ...booking,
        totalAmount: Number(booking.totalAmount),
        address: formatBookingAddress(booking.address),
      },
      reservationCode,
      message: 'Booking payment already verified',
    };
  }

  private async withReservationCodeRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 5,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (this.isUniqueConstraintError(err, 'reservationCode')) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to generate a unique reservation code');
  }

  private async awardInfluencerRewardIfEligibleTx(
    tx: Prisma.TransactionClient,
    usageId: string,
    paidAmount: number,
  ): Promise<string | null> {
    const usage = await tx.discountUsage.findUnique({
      where: { id: usageId },
      include: {
        discountCode: {
          select: {
            type: true,
            influencerId: true,
          },
        },
      },
    });

    if (!usage) return null;
    if (usage.discountCode.type !== DiscountType.INFLUENCER) return null;

    const influencerId = usage.discountCode.influencerId;
    if (!influencerId) return null;

    const settings = await tx.influencerRewardSettings.findFirst();
    if (!settings?.isActive) return null;
    if (paidAmount < Number(settings.minPurchaseAmount)) return null;

    const discountAmount = Number(usage.discountAmount);
    let rewardAmount: number;
    if (settings.rewardType === ReferralRewardType.FIXED) {
      rewardAmount = Number(settings.rewardValue);
    } else {
      rewardAmount = Math.min(
        (discountAmount * Number(settings.rewardValue)) / 100,
        discountAmount,
      );
    }
    rewardAmount = Math.round(rewardAmount * 100) / 100;
    if (rewardAmount <= 0) return null;

    const influencer = await tx.influencer.findUnique({
      where: { id: influencerId },
      select: { userId: true },
    });
    if (!influencer) return null;

    const existingReward = await tx.influencerReward.findUnique({
      where: { usageId },
      select: { status: true },
    });
    if (existingReward?.status === ReferralStatus.REWARDED) {
      return influencer.userId;
    }

    const influencerWallet = await tx.wallet.upsert({
      where: { userId: influencer.userId },
      update: {},
      create: {
        userId: influencer.userId,
        balance: 0,
      },
    });

    const rewardReference = `INFL-REWARD-${usageId}`;

    try {
      const rewardTx = await tx.transaction.create({
        data: {
          walletId: influencerWallet.id,
          type: TransactionType.INFLUENCER_REWARD,
          status: TransactionStatus.COMPLETED,
          paymentMethod: 'REFERRAL',
          amount: rewardAmount,
          reference: rewardReference,
          description: 'Influencer reward for discount usage',
        },
      });

      await tx.influencerReward.upsert({
        where: { usageId },
        update: {
          influencerId,
          rewardAmount,
          status: ReferralStatus.REWARDED,
          walletTransactionId: rewardTx.id,
        },
        create: {
          influencerId,
          usageId,
          rewardAmount,
          status: ReferralStatus.REWARDED,
          walletTransactionId: rewardTx.id,
        },
      });

      await tx.wallet.update({
        where: { id: influencerWallet.id },
        data: {
          balance: {
            increment: rewardAmount,
          },
        },
      });
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return influencer.userId;
      }
      throw err;
    }

    return influencer.userId;
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
      idempotencyKey: rawIdempotencyKey,
    } = createBookingDto;

    const idempotencyKey =
      this.normalizeIdempotencyKey(rawIdempotencyKey) ?? rawIdempotencyKey;
    const existingBooking = await this.findBookingByIdempotencyKey(
      userId,
      idempotencyKey,
    );
    if (existingBooking) {
      return this.buildCreateResponseFromBooking(existingBooking);
    }

    const hasHomeService = services.some(
      (item) =>
        this.resolveServiceMode(item, bookingType) === BookingType.HOME_SERVICE,
    );

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (hasHomeService) {
      address = await this.prisma.address.findFirst({
        where: { id: addressId, userId },
      });

      if (!address) {
        throw new NotFoundException('Address not found');
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const bookingDate = new Date(`${date}T${time}`);

    const serviceRecords: {
      serviceId: string;
      name: string;
      price: number;
      duration: number;
      notes?: string;
      serviceMode: BookingType;
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

      const serviceMode = this.resolveServiceMode(item, bookingType);

      serviceRecords.push({
        serviceId: service.id,
        name: service.name,
        price: resolvePriceForBookingType(service, serviceMode),
        duration: service.duration ?? 0,
        serviceMode,
        ...(item.notes ? { notes: item.notes } : {}),
      });
    }

    const effectiveBookingType =
      this.deriveBookingTypeFromServiceRecords(serviceRecords);

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
      validatedDiscount = await this.discountService.validate(
        discountCode,
        userId,
      );
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    const serviceNames = serviceRecords.map((s) => s.name).join(', ');

    try {
      if (paymentMethod === PaymentMethod.WALLET) {
        const walletResult = await this.withReservationCodeRetry(async () => {
          const reservationCode =
            await this.reservationService.generateReservationCode();

          return this.prisma.$transaction(async (tx) => {
            const booking = await tx.booking.create({
              data: {
                userId,
                services: serviceRecords,
                addressId: addressId ?? null,
                bookingDate,
                bookingTime: time,
                bookingType: effectiveBookingType,
                reservationCode,
                idempotencyKey,
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

            await this.bookingWalletService.debitWalletAndRecordTx(tx, {
              userId,
              amount: finalAmount,
              reference: `BOOK-${booking.id}-${Date.now()}`,
              description: `Payment for: ${serviceNames}${validatedDiscount ? ` (${validatedDiscount.percentage}% discount applied)` : ''}`,
            });

            let influencerRewardUserId: string | null = null;
            if (validatedDiscount) {
              const usage = await tx.discountUsage.create({
                data: {
                  discountCodeId: validatedDiscount.id,
                  userId,
                  bookingId: booking.id,
                  discountAmount,
                },
              });

              await tx.discountCode.update({
                where: { id: validatedDiscount.id },
                data: { usedCount: { increment: 1 } },
              });

              influencerRewardUserId =
                await this.awardInfluencerRewardIfEligibleTx(
                  tx,
                  usage.id,
                  finalAmount,
                );
            }

            return { booking, influencerRewardUserId };
          });
        });

        const { booking, influencerRewardUserId } = walletResult;

        const addressStr = address ? address.fullAddress : 'In-store (Walk-in)';
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
              reservationCode: booking.reservationCode,
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
            reservationCode: booking.reservationCode,
            bookedByName: `${user.firstName} ${user.lastName}`.trim(),
          });
        }

        void Promise.all([
          this.redis.delByPattern('analytics:*'),
          this.redis.del(`wallet:balance:${userId}`),
          ...(influencerRewardUserId
            ? [this.redis.del(`wallet:balance:${influencerRewardUserId}`)]
            : []),
        ]);

        return {
          booking: {
            ...booking,
            services: serviceRecords,
            totalAmount: finalAmount,
          },
          reservationCode: booking.reservationCode,
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

      const booking = await this.withReservationCodeRetry(async () => {
        const reservationCode =
          await this.reservationService.generateReservationCode();

        return this.prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              userId,
              services: serviceRecords,
              addressId: addressId ?? null,
              bookingDate,
              bookingTime: time,
              bookingType: effectiveBookingType,
              reservationCode,
              idempotencyKey,
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

          if (validatedDiscount) {
            await tx.discountUsage.create({
              data: {
                discountCodeId: validatedDiscount.id,
                userId,
                bookingId: created.id,
                discountAmount,
              },
            });
            await tx.discountCode.update({
              where: { id: validatedDiscount.id },
              data: { usedCount: { increment: 1 } },
            });
          }

          return created;
        });
      });

      const addressStr = address ? address.fullAddress : 'In-store (Walk-in)';
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
            reservationCode: booking.reservationCode,
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
          reservationCode: booking.reservationCode,
          bookedByName: `${user.firstName} ${user.lastName}`.trim(),
        });
      }

      void this.redis.delByPattern('analytics:*');

      return {
        booking: {
          ...booking,
          services: serviceRecords,
          totalAmount: finalAmount,
        },
        reservationCode: booking.reservationCode,
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
    } catch (err) {
      if (this.isUniqueConstraintError(err, 'idempotencyKey')) {
        const existing = await this.findBookingByIdempotencyKey(
          userId,
          idempotencyKey,
        );
        if (existing) {
          return this.buildCreateResponseFromBooking(existing);
        }
      }
      throw err;
    }
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
  ) {
    const { services, date, time, addressId, bookingType, discountCode } =
      payload;

    const hasHomeService = services.some(
      (item) =>
        this.resolveServiceMode(item, bookingType) === BookingType.HOME_SERVICE,
    );

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (hasHomeService) {
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
      serviceMode: BookingType;
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

      const serviceMode = this.resolveServiceMode(item, bookingType);

      serviceRecords.push({
        serviceId: service.id,
        name: service.name,
        price: resolvePriceForBookingType(service, serviceMode),
        duration: service.duration ?? 0,
        serviceMode,
        ...(item.notes ? { notes: item.notes } : {}),
      });
    }

    const effectiveBookingType =
      this.deriveBookingTypeFromServiceRecords(serviceRecords);

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
      validatedDiscount = await this.discountService.validate(
        discountCode,
        userId,
      );
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    return {
      user,
      address,
      bookingType: effectiveBookingType,
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
      throw new BadRequestException(
        'Only monnify is supported for booking payments',
      );
    }

    const context = await this.prepareBookingPaymentContext(
      userId,
      dto.bookingPayload,
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
      const metadata =
        (existingIntent.metadata as Record<string, any> | null) ?? {};
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
      throw new BadRequestException(
        'Only monnify is supported for booking payments',
      );
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
    let status = paymentIntent.status;
    const expiresAt = metadata.expiresAt
      ? new Date(String(metadata.expiresAt))
      : null;

    if (
      status === TransactionStatus.PENDING &&
      expiresAt &&
      expiresAt.getTime() <= Date.now()
    ) {
      await this.prisma.transaction.update({
        where: { id: paymentIntent.id },
        data: {
          status: TransactionStatus.FAILED,
          metadata: {
            ...metadata,
            expiredAt: new Date().toISOString(),
          } as any,
        },
      });
      status = TransactionStatus.FAILED;
    }
    const idempotencyKey = this.normalizeIdempotencyKey(
      metadata.idempotencyKey,
    );

    if (
      paymentIntent.status === TransactionStatus.COMPLETED &&
      metadata.bookingId
    ) {
      const existingBooking = await this.prisma.booking.findFirst({
        where: { id: String(metadata.bookingId), userId },
        include: { address: true },
      });

      if (existingBooking) {
        return {
          booking: {
            ...existingBooking,
            totalAmount: Number(existingBooking.totalAmount),
            address: formatBookingAddress(existingBooking.address),
          },
          reservationCode: String(
            metadata.reservationCode ?? existingBooking.reservationCode,
          ),
          message: 'Booking payment already verified',
        };
      }
    }

    if (idempotencyKey) {
      const existing = await this.findBookingByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (existing) {
        return this.buildVerifyResponseFromBooking(
          existing,
          existing.reservationCode,
        );
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

    const payload = metadata.bookingPayload as
      | BookingPaymentPayloadDto
      | undefined;
    if (!payload) {
      throw new BadRequestException('Booking payload missing for this payment');
    }

    const context = await this.prepareBookingPaymentContext(userId, payload);
    const expectedWalletContribution = Number(metadata.walletContribution ?? 0);
    const expectedTotalFromParts =
      Math.round((expectedAmount + expectedWalletContribution) * 100) / 100;
    if (Math.abs(context.finalAmount - expectedTotalFromParts) > 0.001) {
      throw new BadRequestException(
        `Current booking amount (${context.finalAmount}) no longer matches initialized split (${expectedTotalFromParts})`,
      );
    }

    const addressLabel = context.address
      ? context.address.fullAddress
      : 'In-store (Walk-in)';
    let result: {
      booking: Prisma.BookingGetPayload<{ include: { address: true } }> | null;
      reservationCode: string;
      influencerRewardUserId: string | null;
    };

    try {
      result = await this.withReservationCodeRetry(async () => {
        const reservationCode =
          await this.reservationService.generateReservationCode();

        return this.prisma.$transaction(async (tx) => {
          const lockedIntent = await tx.transaction.findUnique({
            where: { id: paymentIntent.id },
          });
          const lockedMetadata =
            (lockedIntent?.metadata as Record<string, any> | null) ?? {};

          const walletContributionToDebit = Number(
            lockedMetadata.walletContribution ?? 0,
          );

          if (
            lockedIntent?.status === TransactionStatus.COMPLETED &&
            lockedMetadata.bookingId
          ) {
            const existingBooking = await tx.booking.findUnique({
              where: { id: String(lockedMetadata.bookingId) },
              include: { address: true },
            });

            return {
              booking: existingBooking,
              reservationCode: String(
                lockedMetadata.reservationCode ??
                  existingBooking?.reservationCode,
              ),
              influencerRewardUserId: null as string | null,
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
              bookingType: context.bookingType,
              reservationCode,
              idempotencyKey: idempotencyKey ?? undefined,
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

          let influencerRewardUserId: string | null = null;

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

            await tx.discountCode.update({
              where: { id: context.validatedDiscount.id },
              data: { usedCount: { increment: 1 } },
            });

            influencerRewardUserId =
              await this.awardInfluencerRewardIfEligibleTx(
                tx,
                usage.id,
                context.finalAmount,
              );
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
            influencerRewardUserId,
          };
        });
      });
    } catch (err) {
      if (idempotencyKey && this.isUniqueConstraintError(err, 'idempotencyKey')) {
        const existing = await this.findBookingByIdempotencyKey(
          userId,
          idempotencyKey,
        );
        if (existing) {
          return this.buildVerifyResponseFromBooking(
            existing,
            existing.reservationCode,
          );
        }
      }
      throw err;
    }

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
      void this.mailService.sendGuestBookingEmail(
        payload.guestEmail,
        payload.guestName,
        {
          services: emailServices,
          date: payload.date,
          time: payload.time,
          address: addressLabel,
          totalAmount: context.finalAmount,
          reservationCode: result.reservationCode,
          bookedByName:
            `${context.user.firstName} ${context.user.lastName}`.trim(),
        },
      );
    }

    void this.redis.delByPattern('analytics:*');
    if (expectedWalletContribution > 0) {
      void this.redis.del(`wallet:balance:${userId}`);
    }
    if (result.influencerRewardUserId) {
      void this.redis.del(`wallet:balance:${result.influencerRewardUserId}`);
    }

    return {
      booking: {
        ...result.booking,
        totalAmount: Number(result.booking.totalAmount),
        address: formatBookingAddress(result.booking.address),
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

    const result = await this.verifyBookingPayment(
      paymentIntent.wallet.userId,
      {
        bookingPaymentReference,
        provider: 'monnify',
      },
    );

    return {
      status: 'processed',
      bookingPaymentReference,
      reservationCode: result.reservationCode,
      bookingId: result.booking.id,
    };
  }

  async getBookingPaymentStatus(
    userId: string,
    bookingPaymentReference: string,
  ) {
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
      status,
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
}
