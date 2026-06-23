import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryBeauticiansDto } from '../dto/query-beauticians.dto';
import { QueryPendingProfileReviewsDto } from '../dto/query-pending-profile-reviews.dto';
import { UpdateAdminBeauticianDto } from '../dto/admin-beautician.dto';
import { serializeBeauticianProfile } from '../utils/beautician-profile.utils';

@Injectable()
export class BeauticianAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryBeauticiansDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BeauticianProfileWhereInput = {
      ...(query.kycStatus && { kycStatus: query.kycStatus }),
      ...(query.profileStatus && { profileStatus: query.profileStatus }),
      ...(query.availabilityStatus && {
        availabilityStatus: query.availabilityStatus,
      }),
      ...(query.ratingMin != null && {
        ratingAverage: { gte: query.ratingMin },
      }),
      ...(query.search && {
        user: {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const [total, beauticians] = await Promise.all([
      this.prisma.beauticianProfile.count({ where }),
      this.prisma.beauticianProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
            },
          },
          _count: { select: { assignedServices: true } },
        },
      }),
    ]);

    return {
      beauticians: beauticians.map((b) => serializeBeauticianProfile(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPendingProfileReviews(query: QueryPendingProfileReviewsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.BeauticianProfileWhereInput = {
      profileStatus: 'PENDING_REVIEW',
      ...(query.submittedDaysAgoMin != null && {
        profileSubmittedAt: {
          lte: new Date(
            Date.now() - query.submittedDaysAgoMin * 24 * 60 * 60 * 1000,
          ),
        },
      }),
    };

    const [total, beauticians] = await Promise.all([
      this.prisma.beauticianProfile.count({ where }),
      this.prisma.beauticianProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { profileSubmittedAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    return {
      beauticians: beauticians.map((b) => serializeBeauticianProfile(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(profileId: string) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            createdAt: true,
          },
        },
        assignedServices: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                homeServicePrice: true,
                isHomeServiceAvailable: true,
              },
            },
          },
        },
        profileReviewedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { assignedServices: true } },
      },
    });

    if (!profile) throw new NotFoundException('Beautician profile not found');

    const [wallet, recentJobs] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { userId: profile.userId },
        select: { balance: true },
      }),
      this.prisma.booking.findMany({
        where: { assignedBeauticianUserId: profile.userId },
        orderBy: { bookingDate: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          bookingDate: true,
          bookingTime: true,
          totalAmount: true,
          reservationCode: true,
          customerRating: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      ...serializeBeauticianProfile(profile),
      walletBalance: Number(wallet?.balance ?? 0),
      kycReferences: {
        qoreIdCustomerId: profile.qoreIdCustomerId,
        qoreIdSessionId: profile.qoreIdSessionId,
      },
      recentJobs: recentJobs.map((job) => ({
        ...job,
        totalAmount: Number(job.totalAmount),
      })),
    };
  }

  async update(profileId: string, dto: UpdateAdminBeauticianDto) {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Beautician profile not found');

    const updated = await this.prisma.beauticianProfile.update({
      where: { id: profileId },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.reviewNotes !== undefined && { reviewNotes: dto.reviewNotes }),
        ...(dto.commissionRateOverride !== undefined && {
          commissionRateOverride: dto.commissionRateOverride,
        }),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return serializeBeauticianProfile(updated);
  }
}