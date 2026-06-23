import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionStatus, TransactionType } from '@prisma/client';
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
      create: jest.fn(),
    },
    booking: {
      findFirst: jest.fn(),
    },
    address: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
          useValue: { generateReservationCode: jest.fn() },
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
});