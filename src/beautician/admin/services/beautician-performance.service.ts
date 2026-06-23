import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  BookingStatus,
  KycStatus,
  ProfileReviewStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BeauticianPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(periodDays = 30) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [
      activeBeauticians,
      onlineBeauticians,
      completedJobs,
      assignedJobs,
      ratedBookings,
      kycSubmitted,
      kycVerified,
      profilesApproved,
      profilesSubmitted,
    ] = await Promise.all([
      this.prisma.beauticianProfile.count({ where: { isActive: true } }),
      this.prisma.beauticianProfile.count({
        where: {
          isActive: true,
          availabilityStatus: AvailabilityStatus.ONLINE,
        },
      }),
      this.prisma.booking.count({
        where: {
          status: BookingStatus.COMPLETED,
          assignedBeauticianUserId: { not: null },
          updatedAt: { gte: since },
        },
      }),
      this.prisma.booking.count({
        where: {
          assignedBeauticianUserId: { not: null },
          createdAt: { gte: since },
          status: { not: BookingStatus.CANCELLED },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          status: BookingStatus.COMPLETED,
          customerRating: { not: null },
          assignedBeauticianUserId: { not: null },
          updatedAt: { gte: since },
        },
        select: { customerRating: true },
      }),
      this.prisma.beauticianProfile.count({
        where: {
          kycStatus: { not: KycStatus.PENDING },
          updatedAt: { gte: since },
        },
      }),
      this.prisma.beauticianProfile.count({
        where: {
          kycStatus: KycStatus.VERIFIED,
          kycVerifiedAt: { gte: since },
        },
      }),
      this.prisma.beauticianProfile.count({
        where: {
          profileStatus: ProfileReviewStatus.APPROVED,
          profileReviewedAt: { gte: since },
        },
      }),
      this.prisma.beauticianProfile.count({
        where: {
          profileSubmittedAt: { gte: since },
        },
      }),
    ]);

    const avgRating =
      ratedBookings.length > 0
        ? Math.round(
            (ratedBookings.reduce(
              (sum, booking) => sum + (booking.customerRating ?? 0),
              0,
            ) /
              ratedBookings.length) *
              100,
          ) / 100
        : null;

    const fillRatePercent =
      assignedJobs > 0
        ? Math.round((completedJobs / assignedJobs) * 1000) / 10
        : null;

    const kycPassRatePercent =
      kycSubmitted > 0
        ? Math.round((kycVerified / kycSubmitted) * 1000) / 10
        : null;

    const profileApprovalRatePercent =
      profilesSubmitted > 0
        ? Math.round((profilesApproved / profilesSubmitted) * 1000) / 10
        : null;

    return {
      periodDays,
      activeBeauticians,
      onlineBeauticians,
      completedJobs,
      fillRatePercent,
      avgRating,
      kycPassRatePercent,
      profileApprovalRatePercent,
    };
  }
}