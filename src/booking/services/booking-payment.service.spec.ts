import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BookingStatus,
  PaymentMethod,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { BookingPaymentService } from './booking-payment.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MonnifyService } from '../../payment/monnify.service';
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../redis/redis.service';
import { DiscountService } from '../../discount/discount.service';
import { WalletDebitService } from '../../wallet/wallet-debit.service';
import { ReservationService } from './reservation.service';
import { BookingLinePricingService } from './booking-line-pricing.service';
import { HomeServiceBookingService } from '../../beautician/home-service-booking/home-service-booking.service';

describe('BookingPaymentService security', () => {
  let service: BookingPaymentService;

  const mockPrisma = {
    wallet: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
    },
    transaction: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    address: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    discountUsage: {
      create: jest.fn(),
    },
    discountCode: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  };

  const mockMonnifyService = {
    initializePayment: jest.fn(),
    verifyPayment: jest.fn(),
  };

  const mockBookingLinePricingService = {
    buildServiceRecords: jest.fn(),
  };

  const mockDiscountService = {
    validate: jest.fn(),
  };

  const mockWalletDebitService = {
    debitWalletAndRecordTx: jest.fn(),
  };

  const mockReservationService = {
    generateReservationCode: jest.fn(),
  };

  const basePayload = {
    services: [{ serviceId: 'svc-1', serviceMode: 'WALK_IN' as const }],
    date: '2026-06-23',
    time: '14:00',
    branchId: 'branch-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingPaymentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MonnifyService, useValue: mockMonnifyService },
        { provide: MailService, useValue: { sendBookingConfirmationEmail: jest.fn() } },
        { provide: RedisService, useValue: { del: jest.fn(), delByPattern: jest.fn() } },
        { provide: DiscountService, useValue: mockDiscountService },
        { provide: WalletDebitService, useValue: mockWalletDebitService },
        {
          provide: ReservationService,
          useValue: mockReservationService,
        },
        {
          provide: BookingLinePricingService,
          useValue: mockBookingLinePricingService,
        },
        {
          provide: HomeServiceBookingService,
          useValue: {
            resolveInitialStatus: jest.fn().mockReturnValue('CONFIRMED'),
            getPaymentConfirmationMessage: jest.fn().mockReturnValue('ok'),
            triggerMatching: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BookingPaymentService>(BookingPaymentService);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
    mockBookingLinePricingService.buildServiceRecords.mockResolvedValue([
      {
        serviceId: 'svc-1',
        name: 'Cut',
        price: 8500,
        quantity: 1,
        serviceMode: 'WALK_IN',
      },
    ]);
    mockPrisma.wallet.upsert.mockResolvedValue({
      id: 'wallet-1',
      userId: 'user-1',
      balance: 5000,
    });
    mockPrisma.transaction.findFirst.mockResolvedValue(null);
    mockMonnifyService.initializePayment.mockResolvedValue({
      responseBody: {
        checkoutUrl: 'https://checkout.monnify.com/test',
        transactionReference: 'MNFY|TEST',
        paymentReference: 'BOOKPAY-MONF-TEST',
      },
    });
    mockPrisma.transaction.create.mockResolvedValue({ id: 'intent-1' });
  });

  describe('initializeBookingPayment', () => {
    it('computes shortfall server-side and rejects mismatched client amount', async () => {
      await expect(
        service.initializeBookingPayment('user-1', {
          bookingPayload: basePayload,
          amount: 1,
          provider: 'monnify',
          idempotencyKey: 'bookpay-test-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('initializes payment using server shortfall when amount is omitted', async () => {
      const result = await service.initializeBookingPayment('user-1', {
        bookingPayload: basePayload,
        provider: 'monnify',
        idempotencyKey: 'bookpay-test-2',
      });

      expect(result.amountToPay).toBe(3500);
      expect(result.walletContribution).toBe(5000);
      expect(mockMonnifyService.initializePayment).toHaveBeenCalledWith(
        'user@example.com',
        3500,
        expect.stringContaining('BOOKPAY-MONF-'),
        'Jane Doe',
        undefined,
      );
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 3500,
            type: TransactionType.BOOKING_PAYMENT,
            status: TransactionStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('verifyBookingPayment', () => {
    const paymentIntent = {
      id: 'intent-1',
      walletId: 'wallet-1',
      amount: 3500,
      status: TransactionStatus.PENDING,
      reference: 'BOOKPAY-MONF-TEST',
      metadata: {
        provider: 'monnify',
        monnifyTransactionReference: 'MNFY|TEST',
        walletContribution: 5000,
        bookingPayload: basePayload,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };

    beforeEach(() => {
      mockPrisma.transaction.findFirst.mockResolvedValue(paymentIntent);
      mockPrisma.booking.findFirst.mockResolvedValue(null);
      mockPrisma.wallet.upsert.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        balance: 5000,
      });
      mockMonnifyService.verifyPayment.mockResolvedValue({
        responseBody: {
          paymentStatus: 'PAID',
          amountPaid: 3500,
        },
      });
      mockPrisma.transaction.updateMany.mockResolvedValue({ count: 1 });
      mockReservationService.generateReservationCode.mockResolvedValue('HLX-TEST');
    });

    it('persists gateway payment before fulfillment and allows retry after fulfillment failure', async () => {
      const prismaError = Object.assign(new Error('operator does not exist'), {
        code: 'P2010',
      });
      const successfulFulfillment = async (
        callback: (tx: typeof mockPrisma) => unknown,
      ) =>
        callback({
            ...mockPrisma,
            transaction: {
              ...mockPrisma.transaction,
              findUnique: jest.fn().mockResolvedValue(paymentIntent),
            },
            booking: {
              create: jest.fn().mockResolvedValue({
                id: 'booking-1',
                reservationCode: 'HLX-TEST',
                status: BookingStatus.CONFIRMED,
                paymentMethod: PaymentMethod.MONNIFY,
                totalAmount: 8500,
                bookingDate: new Date('2026-06-23T14:00:00.000Z'),
                bookingTime: '14:00',
                bookingType: 'WALK_IN',
                services: [],
                address: null,
                branch: null,
              }),
            },
          } as typeof mockPrisma);

      mockPrisma.$transaction
        .mockRejectedValueOnce(prismaError)
        .mockRejectedValueOnce(prismaError)
        .mockRejectedValueOnce(prismaError)
        .mockImplementation(successfulFulfillment);
      mockPrisma.transaction.update.mockResolvedValue(paymentIntent);

      await expect(
        service.verifyBookingPayment('user-1', {
          bookingPaymentReference: 'BOOKPAY-MONF-TEST',
          provider: 'monnify',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.transaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'intent-1',
            status: TransactionStatus.PENDING,
          }),
          data: expect.objectContaining({
            metadata: expect.objectContaining({
              gatewayPaymentStatus: 'PAID',
            }),
          }),
        }),
      );
      expect(mockMonnifyService.verifyPayment).toHaveBeenCalledTimes(1);

      mockPrisma.transaction.findFirst.mockResolvedValue({
        ...paymentIntent,
        metadata: {
          ...paymentIntent.metadata,
          gatewayPaymentStatus: 'PAID',
          gatewayAmountPaid: 3500,
        },
      });

      const result = await service.verifyBookingPayment('user-1', {
        bookingPaymentReference: 'BOOKPAY-MONF-TEST',
        provider: 'monnify',
      });

      expect(mockMonnifyService.verifyPayment).toHaveBeenCalledTimes(1);
      expect(result.reservationCode).toBe('HLX-TEST');
    });

    it('skips gateway re-verification when payment was already confirmed', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({
        ...paymentIntent,
        metadata: {
          ...paymentIntent.metadata,
          gatewayPaymentStatus: 'PAID',
          gatewayAmountPaid: 3500,
        },
      });
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => unknown) =>
          callback({
            ...mockPrisma,
            transaction: {
              ...mockPrisma.transaction,
              findUnique: jest.fn().mockResolvedValue({
                ...paymentIntent,
                metadata: {
                  ...paymentIntent.metadata,
                  gatewayPaymentStatus: 'PAID',
                },
              }),
            },
            booking: {
              create: jest.fn().mockResolvedValue({
                id: 'booking-1',
                reservationCode: 'HLX-TEST',
                status: BookingStatus.CONFIRMED,
                paymentMethod: PaymentMethod.MONNIFY,
                totalAmount: 8500,
                bookingDate: new Date('2026-06-23T14:00:00.000Z'),
                bookingTime: '14:00',
                bookingType: 'WALK_IN',
                services: [],
                address: null,
                branch: null,
              }),
            },
          } as typeof mockPrisma),
      );

      await service.verifyBookingPayment('user-1', {
        bookingPaymentReference: 'BOOKPAY-MONF-TEST',
        provider: 'monnify',
      });

      expect(mockMonnifyService.verifyPayment).not.toHaveBeenCalled();
    });
  });
});