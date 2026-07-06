import { BadRequestException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';

jest.mock('../../../comms/services/comms-realtime.service', () => ({
  CommsRealtimeService: class CommsRealtimeService {},
}));

jest.mock('../../../comms/services/comms-session.service', () => ({
  CommsSessionService: class CommsSessionService {},
}));

import { CustomerCompletionService } from './customer-completion.service';

describe('CustomerCompletionService', () => {
  const bookingId = 'booking-1';
  const customerUserId = 'customer-1';
  const beauticianUserId = 'beautician-1';

  const participantService = {
    getBookingForParticipant: jest.fn(),
    assertCustomerAccess: jest.fn(),
    releaseBeauticianIfIdle: jest.fn(),
  };

  const statusService = {
    assertTransition: jest.fn(),
  };

  const notificationService = {
    notifyServiceCompleted: jest.fn(),
  };

  const creditEarningsService = {
    creditForCompletedBooking: jest.fn(),
    refreshBeauticianRatingAfterReview: jest.fn(),
  };

  const commsRealtime = {
    emitBookingStatus: jest.fn(),
  };

  const commsSessionService = {
    closeForBookingSafely: jest.fn(),
  };

  const tx = {
    booking: { update: jest.fn() },
    review: { upsert: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };

  let service: CustomerCompletionService;

  const baseBooking = {
    id: bookingId,
    userId: customerUserId,
    status: BookingStatus.AWAITING_CUSTOMER_CONFIRM,
    services: [
      {
        serviceId: 'service-1',
        name: 'Braids',
        price: 10000,
        quantity: 1,
        duration: 60,
      },
    ],
    assignedBeauticianUserId: beauticianUserId,
    assignedBeautician: {
      id: beauticianUserId,
      email: 'beautician@example.com',
      firstName: 'Ada',
      lastName: 'Okafor',
      phone: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomerCompletionService(
      prisma as never,
      participantService as never,
      statusService as never,
      notificationService as never,
      creditEarningsService as never,
      commsRealtime as never,
      commsSessionService as never,
    );
  });

  it('persists review and completes booking on customer confirmation', async () => {
    participantService.getBookingForParticipant.mockResolvedValue(baseBooking);
    tx.booking.update.mockResolvedValue({
      ...baseBooking,
      status: BookingStatus.COMPLETED,
      customerRating: 5,
      customerReview: 'Great service',
    });
    creditEarningsService.creditForCompletedBooking.mockResolvedValue({
      amount: 8000,
      alreadyCredited: false,
    });

    const result = await service.confirmCompletion(bookingId, customerUserId, {
      rating: 5,
      review: 'Great service',
    });

    expect(statusService.assertTransition).toHaveBeenCalledWith(
      BookingStatus.AWAITING_CUSTOMER_CONFIRM,
      BookingStatus.COMPLETED,
    );
    expect(tx.review.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { bookingId },
        create: expect.objectContaining({
          userId: customerUserId,
          serviceId: 'service-1',
          bookingId,
          rating: 5,
          comment: 'Great service',
        }),
      }),
    );
    expect(creditEarningsService.creditForCompletedBooking).toHaveBeenCalledWith(
      bookingId,
      5,
    );
    expect(result.message).toBe('Thank you for confirming service completion');
  });

  it('accepts late rating when booking was auto-finalized without a review', async () => {
    participantService.getBookingForParticipant.mockResolvedValue({
      ...baseBooking,
      status: BookingStatus.COMPLETED,
      customerRating: null,
      customerReview: null,
    });
    tx.booking.update.mockResolvedValue({
      ...baseBooking,
      status: BookingStatus.COMPLETED,
      customerRating: 4,
      customerReview: 'Good',
    });

    const result = await service.confirmCompletion(bookingId, customerUserId, {
      rating: 4,
      review: 'Good',
    });

    expect(statusService.assertTransition).not.toHaveBeenCalled();
    expect(tx.review.upsert).toHaveBeenCalled();
    expect(
      creditEarningsService.refreshBeauticianRatingAfterReview,
    ).toHaveBeenCalledWith(bookingId);
    expect(creditEarningsService.creditForCompletedBooking).not.toHaveBeenCalled();
    expect(result.message).toBe('Thank you for your rating');
  });

  it('returns idempotently when booking already has a rating', async () => {
    participantService.getBookingForParticipant.mockResolvedValue({
      ...baseBooking,
      status: BookingStatus.COMPLETED,
      customerRating: 5,
      customerReview: 'Already rated',
    });

    const result = await service.confirmCompletion(bookingId, customerUserId, {
      rating: 5,
      review: 'New review',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result.message).toBe('Booking already completed');
  });

  it('rejects bookings without services to review', async () => {
    participantService.getBookingForParticipant.mockResolvedValue({
      ...baseBooking,
      services: [],
    });

    await expect(
      service.confirmCompletion(bookingId, customerUserId, { rating: 5 }),
    ).rejects.toThrow(BadRequestException);
  });
});