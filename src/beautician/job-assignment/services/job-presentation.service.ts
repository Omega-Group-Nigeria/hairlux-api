import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import {
  formatBookingResponse,
  normalizeBookingServices,
} from '../../../booking/utils/booking.utils';
import { maskAddress } from '../../matching/utils/booking-assignment.utils';

@Injectable()
export class JobPresentationService {
  bookingInclude() {
    return {
      address: true,
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

  buildAcceptedResponse(booking: {
    id: string;
    services: unknown;
    totalAmount: unknown;
    bookingDate: Date;
    bookingTime: string;
    status: BookingStatus;
    address: {
      fullAddress: string;
      latitude: unknown;
      longitude: unknown;
      city: string | null;
      state: string | null;
    } | null;
    user: {
      firstName: string;
      lastName: string;
      phone: string | null;
    };
  }) {
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
      customer: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
        phone: booking.user.phone,
      },
      customerAddress,
      navigationDeepLink: navigationQuery
        ? `https://maps.google.com/?q=${navigationQuery}`
        : null,
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