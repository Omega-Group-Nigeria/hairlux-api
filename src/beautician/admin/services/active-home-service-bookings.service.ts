import { Injectable } from '@nestjs/common';
import { BookingStatus, BookingType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { maskAddress } from '../../matching/utils/booking-assignment.utils';

const ACTIVE_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING_ASSIGNMENT,
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
];

@Injectable()
export class ActiveHomeServiceBookingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        bookingType: { in: [BookingType.HOME_SERVICE, BookingType.MIXED] },
      },
      orderBy: { bookingDate: 'asc' },
      take: 100,
      include: {
        address: {
          select: {
            city: true,
            state: true,
            latitude: true,
            longitude: true,
            fullAddress: true,
          },
        },
        assignedBeautician: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            beauticianProfile: {
              select: {
                availabilityStatus: true,
                currentLat: true,
                currentLng: true,
              },
            },
          },
        },
        user: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      status: booking.status,
      bookingDate: booking.bookingDate,
      bookingTime: booking.bookingTime,
      totalAmount: Number(booking.totalAmount),
      customer: {
        firstName: booking.user.firstName,
        lastName: booking.user.lastName,
      },
      beautician: booking.assignedBeautician
        ? {
            id: booking.assignedBeautician.id,
            firstName: booking.assignedBeautician.firstName,
            lastName: booking.assignedBeautician.lastName,
            availabilityStatus:
              booking.assignedBeautician.beauticianProfile?.availabilityStatus ??
              null,
            lat: booking.assignedBeautician.beauticianProfile?.currentLat
              ? Number(booking.assignedBeautician.beauticianProfile.currentLat)
              : null,
            lng: booking.assignedBeautician.beauticianProfile?.currentLng
              ? Number(booking.assignedBeautician.beauticianProfile.currentLng)
              : null,
          }
        : null,
      location: booking.address
        ? {
            city: booking.address.city,
            state: booking.address.state,
            lat: booking.address.latitude
              ? Number(booking.address.latitude)
              : null,
            lng: booking.address.longitude
              ? Number(booking.address.longitude)
              : null,
            maskedAddress: maskAddress(booking.address.fullAddress),
          }
        : null,
    }));
  }
}