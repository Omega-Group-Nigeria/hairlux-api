import { Injectable } from '@nestjs/common';
import {
  BookingCommsCloseReason,
  BookingCommsSessionStatus,
  BookingStatus,
  BookingType,
} from '@prisma/client';
import {
  formatBookingResponse,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { maskAddress } from '../../matching/utils/booking-assignment.utils';
import { CommsPresenterService } from '../../../comms/services/comms-presenter.service';

@Injectable()
export class JobPresentationService {
  constructor(private readonly commsPresenter: CommsPresenterService) {}

  bookingInclude() {
    return {
      address: true,
      commsSession: true,
      assignedBeautician: {
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
          phone: true,
        },
      },
    } as const;
  }

  buildAcceptedResponse(
    booking: {
      id: string;
      bookingType: BookingType;
      services: unknown;
      totalAmount: unknown;
      bookingDate: Date;
      bookingTime: string;
      status: BookingStatus;
      commsSession?: {
        streamChannelId: string;
        streamCallCid: string | null;
        status: BookingCommsSessionStatus;
        closeReason: BookingCommsCloseReason | null;
      } | null;
      assignedBeautician?: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string | null;
      } | null;
      address: {
        fullAddress: string;
        latitude: unknown;
        longitude: unknown;
        city: string | null;
        state: string | null;
      } | null;
      user: {
        id: string;
        firstName: string;
        lastName: string;
        phone: string | null;
      };
    },
    meta?: { payoutAmount: number; commissionRate: number },
  ) {
    const services = normalizeBookingServices(booking.services);
    const formatted = formatBookingResponse(booking);

    const customerAddress = booking.address
      ? {
          fullAddress: booking.address.fullAddress,
          lat:
            booking.address.latitude != null
              ? Number(booking.address.latitude)
              : null,
          lng:
            booking.address.longitude != null
              ? Number(booking.address.longitude)
              : null,
          city: booking.address.city,
          state: booking.address.state,
        }
      : null;

    const navigationQuery = booking.address?.fullAddress
      ? encodeURIComponent(booking.address.fullAddress)
      : '';

    return {
      booking: formatted,
      services,
      payoutAmount: meta?.payoutAmount ?? null,
      commissionRate: meta?.commissionRate ?? null,
      customer: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        phone: booking.user.phone,
      },
      customerAddress,
      navigationDeepLink: navigationQuery
        ? `https://maps.google.com/?q=${navigationQuery}`
        : null,
      comms: this.commsPresenter.embedForBooking({
        id: booking.id,
        bookingType: booking.bookingType,
        status: booking.status,
        commsSession: booking.commsSession ?? null,
        user: booking.user,
        assignedBeautician: booking.assignedBeautician ?? null,
      }),
    };
  }

  buildHistoryResponse(
    booking: {
      id: string;
      services: unknown;
      totalAmount: unknown;
      bookingDate: Date;
      bookingTime: string;
      status: BookingStatus;
      reservationCode: string | null;
      cancelReason: string | null;
      customerRating: number | null;
      customerReview: string | null;
      serviceCompletedAt: Date | null;
      updatedAt: Date;
      address: {
        fullAddress: string;
        city: string | null;
        state: string | null;
      } | null;
      user: {
        firstName: string;
        lastName: string;
      };
    },
    meta: { earningsAmount: number | null },
  ) {
    const services = normalizeBookingServices(booking.services);
    const formatted = formatBookingResponse(booking);

    return {
      booking: formatted,
      services,
      customer: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
      },
      customerAddress: booking.address
        ? {
            fullAddress: booking.address.fullAddress,
            city: booking.address.city,
            state: booking.address.state,
          }
        : null,
      customerRating: booking.customerRating,
      customerReview: booking.customerReview,
      cancelReason: booking.cancelReason,
      serviceCompletedAt: booking.serviceCompletedAt,
      completedAt:
        booking.status === BookingStatus.COMPLETED
          ? booking.serviceCompletedAt ?? booking.updatedAt
          : null,
      earningsAmount: meta.earningsAmount,
    };
  }

  buildAvailableOffer(offer: {
    id: string;
    bookingId: string;
    status: string;
    offeredAt: Date;
    expiresAt: Date;
    distanceKmAtOffer: unknown;
    estEarningsAtOffer: unknown;
    booking: {
      id: string;
      bookingDate: Date;
      bookingTime: string;
      totalAmount: unknown;
      services: unknown;
      address: { fullAddress: string; city: string | null; state: string | null } | null;
    };
  }) {
    const services = normalizeBookingServices(offer.booking.services);

    return {
      offerId: offer.id,
      bookingId: offer.bookingId,
      status: offer.status,
      offeredAt: offer.offeredAt,
      expiresAt: offer.expiresAt,
      distanceKm: Number(offer.distanceKmAtOffer ?? 0),
      estEarnings: Number(offer.estEarningsAtOffer ?? 0),
      booking: {
        id: offer.booking.id,
        bookingDate: offer.booking.bookingDate,
        bookingTime: offer.booking.bookingTime,
        totalAmount: Number(offer.booking.totalAmount ?? 0),
        services,
        maskedAddress: offer.booking.address
          ? maskAddress(offer.booking.address.fullAddress)
          : null,
        city: offer.booking.address?.city ?? null,
        state: offer.booking.address?.state ?? null,
      },
    };
  }
}