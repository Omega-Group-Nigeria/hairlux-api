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
  bookingUserReadInclude,
  calculateBookingServicesTotal,
  formatBookingResponse,
  normalizeBookingServices,
  toBookingServicesJson,
  toEmailServiceLines,
} from '../utils/booking.utils';
import {
  buildBookingLocationCreateData,
  hasTemporaryServiceLocation,
  resolveBookingAddressLabel,
} from '../utils/booking-location.utils';
import { WalletDebitService } from '../../wallet/wallet-debit.service';
import { ReservationService } from './reservation.service';
import { BookingLinePricingService } from './booking-line-pricing.service';
import { HomeServiceBookingService } from '../../beautician/home-service-booking/home-service-booking.service';
import { bookingNeedsBeauticianAssignment } from '../../beautician/matching/utils/booking-assignment.utils';
import { BookingPushNotifier } from '../../notifications/booking/booking-push.notifier';

@Injectable()
export class BookingPaymentService {
  constructor(
    private prisma: PrismaService,
    private monnifyService: MonnifyService,
    private mailService: MailService,
    private redis: RedisService,
    private discountService: DiscountService,
    private walletDebitService: WalletDebitService,
    private reservationService: ReservationService,
    private bookingLinePricingService: BookingLinePricingService,
    private homeServiceBookingService: HomeServiceBookingService,
    private bookingPushNotifier: BookingPushNotifier,
  ) { }

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
    serviceRecords: Array<{ serviceMode?: BookingType }>,
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
        ...bookingUserReadInclude,
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
        branch: { select: { id: true; name: true; address: true } };
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

    const formattedBooking = formatBookingResponse(booking);

    return {
      booking: formattedBooking,
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
      include: {
        address: true;
        branch: { select: { id: true; name: true; address: true } };
      };
    }>,
    reservationCode: string,
  ) {
    return {
      booking: formatBookingResponse(booking),
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
      tempLatitude,
      tempLongitude,
      tempFullAddress,
      bookingType,
      guestName,
      guestPhone,
      guestEmail,
      paymentMethod,
      discountCode,
      branchId,
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

    const locationData = buildBookingLocationCreateData({
      addressId,
      tempLatitude,
      tempLongitude,
      tempFullAddress,
    });

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (hasHomeService) {
      if (locationData.addressId) {
        address = await this.prisma.address.findFirst({
          where: {
            id: locationData.addressId,
            userId,
            deletedAt: null,
          },
        });

        if (!address) {
          throw new NotFoundException('Address not found');
        }
      } else if (!hasTemporaryServiceLocation(locationData)) {
        throw new BadRequestException(
          'addressId or temporary location (tempLatitude, tempLongitude, tempFullAddress) is required for HOME_SERVICE bookings',
        );
      }
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true },
    });

    const bookingDate = new Date(`${date}T${time}`);

    const serviceRecords =
      await this.bookingLinePricingService.buildServiceRecords({
        services,
        bookingType,
        branchId,
        resolveServiceMode: (item, fallback) =>
          this.resolveServiceMode(item, fallback),
      });

    const effectiveBookingType =
      this.deriveBookingTypeFromServiceRecords(serviceRecords);

    const totalAmount = calculateBookingServicesTotal(serviceRecords);

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
        branchId,
      );
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    const serviceNames = serviceRecords.map((s) => s.name).join(', ');
    const initialStatus = this.homeServiceBookingService.resolveInitialStatus(
      effectiveBookingType,
      serviceRecords,
    );

    try {
      if (paymentMethod === PaymentMethod.WALLET) {
        const walletResult = await this.withReservationCodeRetry(async () => {
          const reservationCode =
            await this.reservationService.generateReservationCode();

          return this.prisma.$transaction(async (tx) => {
            const booking = await tx.booking.create({
              data: {
                userId,
                services: toBookingServicesJson(serviceRecords),
                addressId: locationData.addressId,
                tempLatitude: locationData.tempLatitude,
                tempLongitude: locationData.tempLongitude,
                tempFullAddress: locationData.tempFullAddress,
                branchId: branchId ?? null,
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
                status: initialStatus,
              },
              include: bookingUserReadInclude,
            });

            await this.walletDebitService.debitWalletAndRecordTx(tx, {
              userId,
              amount: finalAmount,
              reference: `BOOK-${booking.id}-${Date.now()}`,
              description: `Payment for: ${serviceNames}${validatedDiscount ? ` (${validatedDiscount.percentage}% discount applied)` : ''}`,
              insufficientBalanceMessage:
                'Insufficient wallet balance to complete this booking',
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

        const addressStr = resolveBookingAddressLabel({
          address,
          tempLatitude: locationData.tempLatitude,
          tempLongitude: locationData.tempLongitude,
          tempFullAddress: locationData.tempFullAddress,
        });
        const emailServices = toEmailServiceLines(serviceRecords);
        const isHomeService = bookingNeedsBeauticianAssignment(
          effectiveBookingType,
          serviceRecords,
        );

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
              isHomeService,
            },
          );
          this.bookingPushNotifier.notifyConfirmed({
            userId,
            bookingId: booking.id,
            reservationCode: booking.reservationCode,
          });
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

        if (initialStatus === BookingStatus.PENDING_ASSIGNMENT) {
          void this.homeServiceBookingService.triggerMatching(booking.id);
        }

        return {
          booking: {
            ...formatBookingResponse(booking),
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
          message:
            this.homeServiceBookingService.getPaymentConfirmationMessage(
              initialStatus,
            ),
        };
      }

      const booking = await this.withReservationCodeRetry(async () => {
        const reservationCode =
          await this.reservationService.generateReservationCode();

        return this.prisma.$transaction(async (tx) => {
          const created = await tx.booking.create({
            data: {
              userId,
              services: toBookingServicesJson(serviceRecords),
              addressId: locationData.addressId,
              tempLatitude: locationData.tempLatitude,
              tempLongitude: locationData.tempLongitude,
              tempFullAddress: locationData.tempFullAddress,
              branchId: branchId ?? null,
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
            include: bookingUserReadInclude,
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

      const addressStr = resolveBookingAddressLabel({
        address,
        tempLatitude: locationData.tempLatitude,
        tempLongitude: locationData.tempLongitude,
        tempFullAddress: locationData.tempFullAddress,
      });
      const emailServices = toEmailServiceLines(serviceRecords);
      const isHomeService = bookingNeedsBeauticianAssignment(
        effectiveBookingType,
        serviceRecords,
      );

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
            isHomeService,
          },
        );
        this.bookingPushNotifier.notifyConfirmed({
          userId,
          bookingId: booking.id,
          reservationCode: booking.reservationCode,
        });
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
          ...formatBookingResponse(booking),
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

  private computePaymentSplit(finalAmount: number, walletBalance: number) {
    const walletContribution = Math.min(walletBalance, finalAmount);
    const requiredExternalAmount = Math.max(
      0,
      Math.round((finalAmount - walletContribution) * 100) / 100,
    );

    return { walletContribution, requiredExternalAmount };
  }

  private async lockTransactionForUpdate(
    tx: Prisma.TransactionClient,
    transactionId: string,
  ) {
    await tx.$executeRaw(
      Prisma.sql`SELECT id FROM transactions WHERE id = ${transactionId} FOR UPDATE`,
    );
  }

  private isGatewayPaymentConfirmed(
    metadata: Record<string, any>,
  ): boolean {
    return metadata.gatewayPaymentStatus === 'PAID';
  }

  private isPrismaClientError(err: unknown): boolean {
    if (typeof err !== 'object' || err === null || !('code' in err)) {
      return false;
    }

    const code = (err as { code?: unknown }).code;
    return typeof code === 'string' && code.startsWith('P');
  }

  private isRetryableFulfillmentError(err: unknown): boolean {
    if (
      err instanceof BadRequestException ||
      err instanceof NotFoundException ||
      err instanceof ConflictException
    ) {
      return false;
    }

    return this.isPrismaClientError(err);
  }

  private async withBookingFulfillmentRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (!this.isRetryableFulfillmentError(err)) {
          throw err;
        }
        lastError = err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Booking fulfillment failed after retries');
  }

  private async confirmGatewayPaymentOnIntent(
    paymentIntentId: string,
    verification: { responseBody: Record<string, any> },
    metadata: Record<string, any>,
  ) {
    if (this.isGatewayPaymentConfirmed(metadata)) {
      return;
    }

    const paidAmount = Number(verification.responseBody.amountPaid);
    await this.prisma.transaction.updateMany({
      where: {
        id: paymentIntentId,
        status: TransactionStatus.PENDING,
      },
      data: {
        metadata: {
          ...metadata,
          gatewayPaymentStatus: 'PAID',
          gatewayAmountPaid: paidAmount,
          gatewayVerifiedAt: new Date().toISOString(),
          paymentStatus: verification.responseBody.paymentStatus,
          ...verification.responseBody,
        } as any,
      },
    });
  }

  private async recordFulfillmentFailure(
    paymentIntentId: string,
    metadata: Record<string, any>,
    error: unknown,
  ) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Number(metadata.bookingFulfillmentAttempts ?? 0) + 1;

    try {
      await this.prisma.transaction.update({
        where: { id: paymentIntentId },
        data: {
          metadata: {
            ...metadata,
            gatewayPaymentStatus: metadata.gatewayPaymentStatus ?? 'PAID',
            lastBookingFulfillmentError: message,
            lastBookingFulfillmentAttemptAt: new Date().toISOString(),
            bookingFulfillmentAttempts: attempts,
          } as any,
        },
      });
    } catch {
      // Non-fatal: payment confirmation must not be lost because audit write failed.
    }
  }

  private throwPaymentReceivedBookingPending(
    bookingPaymentReference: string,
    message: string,
    retryable = true,
  ): never {
    throw new ConflictException({
      message,
      paymentReceived: true,
      bookingCreated: false,
      bookingPaymentReference,
      retryable,
    });
  }

  private async prepareBookingPaymentContext(
    userId: string,
    payload: BookingPaymentPayloadDto,
  ) {
    const {
      services,
      date,
      time,
      addressId,
      tempLatitude,
      tempLongitude,
      tempFullAddress,
      bookingType,
      discountCode,
      branchId,
    } = payload;

    const hasHomeService = services.some(
      (item) =>
        this.resolveServiceMode(item, bookingType) === BookingType.HOME_SERVICE,
    );

    const locationData = buildBookingLocationCreateData({
      addressId,
      tempLatitude,
      tempLongitude,
      tempFullAddress,
    });

    let address: Awaited<
      ReturnType<typeof this.prisma.address.findFirst>
    > | null = null;
    if (hasHomeService) {
      if (locationData.addressId) {
        address = await this.prisma.address.findFirst({
          where: {
            id: locationData.addressId,
            userId,
            deletedAt: null,
          },
        });

        if (!address) {
          throw new NotFoundException('Address not found');
        }
      } else if (!hasTemporaryServiceLocation(locationData)) {
        throw new BadRequestException(
          'addressId or temporary location (tempLatitude, tempLongitude, tempFullAddress) is required for HOME_SERVICE bookings',
        );
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

    const serviceRecords =
      await this.bookingLinePricingService.buildServiceRecords({
        services,
        bookingType,
        branchId,
        resolveServiceMode: (item, fallback) =>
          this.resolveServiceMode(item, fallback),
      });

    const effectiveBookingType =
      this.deriveBookingTypeFromServiceRecords(serviceRecords);

    const totalAmount = calculateBookingServicesTotal(serviceRecords);

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
        branchId,
      );
      discountAmount =
        Math.round(((totalAmount * validatedDiscount.percentage) / 100) * 100) /
        100;
      finalAmount = Math.max(0, totalAmount - discountAmount);
    }

    return {
      user,
      address,
      locationData,
      bookingType: effectiveBookingType,
      bookingDate,
      branchId: branchId ?? null,
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
    const { walletContribution, requiredExternalAmount } =
      this.computePaymentSplit(context.finalAmount, walletBalance);

    if (requiredExternalAmount <= 0) {
      throw new BadRequestException(
        'Wallet balance is sufficient. Complete this booking with WALLET payment.',
      );
    }

    if (
      dto.amount !== undefined &&
      Math.abs(Number(dto.amount) - requiredExternalAmount) > 0.001
    ) {
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
      dto.redirectUrl,
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
      !this.isGatewayPaymentConfirmed(metadata) &&
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
        include: bookingUserReadInclude,
      });

      if (existingBooking) {
        return {
          booking: formatBookingResponse(existingBooking),
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

    let activeMetadata = { ...metadata };
    let verification: { responseBody: Record<string, any> };

    if (this.isGatewayPaymentConfirmed(activeMetadata)) {
      verification = {
        responseBody: {
          paymentStatus: 'PAID',
          amountPaid:
            activeMetadata.gatewayAmountPaid ?? Number(paymentIntent.amount),
        },
      };
    } else {
      verification = await this.monnifyService.verifyPayment(
        String(monnifyTransactionReference),
      );

      if (verification.responseBody.paymentStatus !== 'PAID') {
        await this.prisma.transaction.update({
          where: { id: paymentIntent.id },
          data: {
            status: TransactionStatus.FAILED,
            metadata: {
              ...activeMetadata,
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

      await this.confirmGatewayPaymentOnIntent(
        paymentIntent.id,
        verification,
        activeMetadata,
      );
      activeMetadata = {
        ...activeMetadata,
        gatewayPaymentStatus: 'PAID',
        gatewayAmountPaid: paidAmount,
        gatewayVerifiedAt: new Date().toISOString(),
        paymentStatus: verification.responseBody.paymentStatus,
        ...verification.responseBody,
      };
    }

    const payload = activeMetadata.bookingPayload as
      | BookingPaymentPayloadDto
      | undefined;
    if (!payload) {
      throw new BadRequestException('Booking payload missing for this payment');
    }

    const context = await this.prepareBookingPaymentContext(userId, payload);
    const expectedAmount = Number(paymentIntent.amount);
    const expectedWalletContribution = Number(
      activeMetadata.walletContribution ?? 0,
    );
    const expectedTotalFromParts =
      Math.round((expectedAmount + expectedWalletContribution) * 100) / 100;
    if (Math.abs(context.finalAmount - expectedTotalFromParts) > 0.001) {
      throw new BadRequestException({
        message: `Current booking amount (${context.finalAmount}) no longer matches initialized split (${expectedTotalFromParts})`,
        paymentReceived: true,
        bookingCreated: false,
        retryable: false,
        bookingPaymentReference: dto.bookingPaymentReference,
      });
    }

    const wallet = await this.getOrCreateWallet(userId);
    const currentWalletBalance = Number(wallet.balance);
    if (expectedWalletContribution > currentWalletBalance) {
      throw new BadRequestException({
        message: `Wallet balance changed before verification. Needed ${expectedWalletContribution}, available ${currentWalletBalance}`,
        paymentReceived: true,
        bookingCreated: false,
        retryable: true,
        bookingPaymentReference: dto.bookingPaymentReference,
      });
    }

    const walletDebitReference = `BOOK-WAL-${dto.bookingPaymentReference}`;

    const addressLabel = resolveBookingAddressLabel({
      address: context.address,
      tempLatitude: context.locationData.tempLatitude,
      tempLongitude: context.locationData.tempLongitude,
      tempFullAddress: context.locationData.tempFullAddress,
    });
    const initialStatus = this.homeServiceBookingService.resolveInitialStatus(
      context.bookingType,
      context.serviceRecords,
    );
    let result: {
      booking: Prisma.BookingGetPayload<{ include: { address: true } }> | null;
      reservationCode: string;
      influencerRewardUserId: string | null;
    };

    try {
      result = await this.withBookingFulfillmentRetry(async () =>
        this.withReservationCodeRetry(async () => {
          const reservationCode =
            await this.reservationService.generateReservationCode();

          return this.prisma.$transaction(async (tx) => {
            await this.lockTransactionForUpdate(tx, paymentIntent.id);

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

            if (lockedIntent?.status !== TransactionStatus.PENDING) {
              throw new ConflictException('Booking payment is no longer pending');
            }

            if (walletContributionToDebit > 0) {
              await this.walletDebitService.debitWalletAndRecordTx(tx, {
                userId,
                amount: walletContributionToDebit,
                reference: walletDebitReference,
                description: `Wallet contribution for booking payment ${dto.bookingPaymentReference}`,
                metadata: {
                  purpose: 'BOOKING_PAYMENT_WALLET_CONTRIBUTION',
                  bookingPaymentReference: dto.bookingPaymentReference,
                },
                insufficientBalanceMessage:
                  `Wallet balance changed before verification. Needed ${walletContributionToDebit}`,
              });
            }

            const booking = await tx.booking.create({
              data: {
                userId,
                services: toBookingServicesJson(context.serviceRecords),
                addressId: context.locationData.addressId,
                tempLatitude: context.locationData.tempLatitude,
                tempLongitude: context.locationData.tempLongitude,
                tempFullAddress: context.locationData.tempFullAddress,
                branchId: context.branchId,
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
                status: initialStatus,
                notes:
                  `Paid online via MONNIFY (${dto.bookingPaymentReference})` +
                  (addressLabel ? ` | ${addressLabel}` : ''),
              },
              include: bookingUserReadInclude,
            });

            let influencerRewardUserId: string | null = null;

            if (walletContributionToDebit > 0) {
              await tx.transaction.updateMany({
                where: {
                  walletId: paymentIntent.walletId,
                  reference: walletDebitReference,
                  type: TransactionType.DEBIT,
                },
                data: {
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

            const finalized = await tx.transaction.updateMany({
              where: {
                id: paymentIntent.id,
                status: TransactionStatus.PENDING,
              },
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

            if (finalized.count === 0) {
              throw new ConflictException('Booking payment already processed');
            }

            return {
              booking,
              reservationCode,
              influencerRewardUserId,
            };
          });
        }),
      );
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

      if (this.isGatewayPaymentConfirmed(activeMetadata)) {
        await this.recordFulfillmentFailure(
          paymentIntent.id,
          activeMetadata,
          err,
        );

        if (err instanceof ConflictException) {
          const response = err.getResponse();
          if (
            typeof response === 'string' &&
            response === 'Booking payment already processed'
          ) {
            throw err;
          }
        }

        if (!(err instanceof BadRequestException)) {
          this.throwPaymentReceivedBookingPending(
            dto.bookingPaymentReference,
            'Your payment was received, but booking creation is still pending. Please retry verification shortly.',
          );
        }
      }

      throw err;
    }

    if (!result.booking) {
      throw new ConflictException('Booking payment already processed');
    }

    const emailServices = toEmailServiceLines(context.serviceRecords);
    const isHomeService = bookingNeedsBeauticianAssignment(
      context.bookingType,
      context.serviceRecords,
    );

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
        isHomeService,
      },
    );
    this.bookingPushNotifier.notifyConfirmed({
      userId,
      bookingId: result.booking.id,
      reservationCode: result.reservationCode,
    });

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

    if (
      result.booking &&
      initialStatus === BookingStatus.PENDING_ASSIGNMENT
    ) {
      void this.homeServiceBookingService.triggerMatching(result.booking.id);
    }

    return {
      booking: formatBookingResponse(result.booking),
      reservationCode: result.reservationCode,
      message: this.homeServiceBookingService.getPaymentConfirmationMessage(
        initialStatus,
      ),
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
      bookingId: String((result.booking as Record<string, unknown>).id),
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

    const gatewayPaymentConfirmed = this.isGatewayPaymentConfirmed(metadata);
    const bookingPending =
      gatewayPaymentConfirmed &&
      paymentIntent.status === TransactionStatus.PENDING &&
      !linkedBooking;

    return {
      bookingPaymentReference,
      provider: metadata.provider ?? 'monnify',
      status: paymentIntent.status,
      amount: Number(paymentIntent.amount),
      gatewayReference: metadata.monnifyTransactionReference ?? null,
      paymentReference: metadata.monnifyPaymentReference ?? null,
      expiresAt: metadata.expiresAt ?? null,
      gatewayPaymentConfirmed,
      bookingPending,
      canRetryVerification: bookingPending,
      lastBookingFulfillmentError:
        typeof metadata.lastBookingFulfillmentError === 'string'
          ? metadata.lastBookingFulfillmentError
          : null,
      booking: linkedBooking
        ? {
          ...linkedBooking,
          totalAmount: Number(linkedBooking.totalAmount),
        }
        : null,
    };
  }
}