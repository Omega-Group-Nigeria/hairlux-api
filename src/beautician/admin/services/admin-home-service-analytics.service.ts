import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const ASSIGNMENT_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING_ASSIGNMENT,
  BookingStatus.ASSIGNED,
  BookingStatus.EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.ARRIVED_VERIFIED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.AWAITING_CUSTOMER_CONFIRM,
  BookingStatus.COMPLETED,
];

@Injectable()
export class AdminHomeServiceAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getKpis(periodDays = 30) {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [pendingAssignment, completed, cancelled, offersSent, offersAccepted] =
      await Promise.all([
        this.prisma.booking.count({
          where: { status: BookingStatus.PENDING_ASSIGNMENT },
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
            status: BookingStatus.CANCELLED,
            bookingType: { in: ['HOME_SERVICE', 'MIXED'] },
            updatedAt: { gte: since },
          },
        }),
        this.prisma.jobOffer.count({ where: { offeredAt: { gte: since } } }),
        this.prisma.jobOffer.count({
          where: { status: 'ACCEPTED', respondedAt: { gte: since } },
        }),
      ]);

    const assignmentSamples = await this.prisma.booking.findMany({
      where: {
        assignedBeauticianUserId: { not: null },
        createdAt: { gte: since },
        status: { in: ASSIGNMENT_STATUSES },
      },
      select: { createdAt: true, updatedAt: true, status: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });

    const assignmentDurations = assignmentSamples
      .filter((booking) => booking.status !== BookingStatus.PENDING_ASSIGNMENT)
      .map((booking) => booking.updatedAt.getTime() - booking.createdAt.getTime())
      .filter((ms) => ms > 0);

    const avgAssignmentMinutes =
      assignmentDurations.length > 0
        ? Math.round(
            assignmentDurations.reduce((sum, ms) => sum + ms, 0) /
              assignmentDurations.length /
              60_000,
          )
        : null;

    const offerAcceptRatePercent =
      offersSent > 0
        ? Math.round((offersAccepted / offersSent) * 1000) / 10
        : null;

    return {
      periodDays,
      pendingAssignment,
      completedHomeServices: completed,
      cancelledHomeServices: cancelled,
      avgAssignmentMinutes,
      offerAcceptRatePercent,
    };
  }
}