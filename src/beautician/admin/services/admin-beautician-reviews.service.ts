import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  BeauticianReviewSortBy,
  QueryBeauticianReviewsDto,
  SortOrder,
} from '../../dto/query-beautician-reviews.dto';

const REVIEW_LIST_SELECT = {
  id: true,
  rating: true,
  comment: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  bookingId: true,
  serviceId: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  service: {
    select: {
      id: true,
      name: true,
    },
  },
  booking: {
    select: {
      id: true,
      reservationCode: true,
      bookingDate: true,
      serviceCompletedAt: true,
      customerRating: true,
    },
  },
} satisfies Prisma.ReviewSelect;

export type AdminBeauticianReviewItem = Prisma.ReviewGetPayload<{
  select: typeof REVIEW_LIST_SELECT;
}>;

/**
 * Admin read model for customer service reviews tied to a beautician
 * via booking.assignedBeauticianUserId.
 */
@Injectable()
export class AdminBeauticianReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProfile(profileId: string, query: QueryBeauticianReviewsDto) {
    const beauticianUserId = await this.resolveBeauticianUserId(profileId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhere(beauticianUserId, query);
    const orderBy = this.buildOrderBy(query);

    const [total, items] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: REVIEW_LIST_SELECT,
      }),
    ]);

    return {
      beauticianProfileId: profileId,
      beauticianUserId,
      items: items.map((item) => this.mapItem(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  private async resolveBeauticianUserId(profileId: string): Promise<string> {
    const profile = await this.prisma.beauticianProfile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException('Beautician profile not found');
    }

    return profile.userId;
  }

  private buildWhere(
    beauticianUserId: string,
    query: QueryBeauticianReviewsDto,
  ): Prisma.ReviewWhereInput {
    const ratingFilter: Prisma.IntFilter | undefined =
      query.ratingMin != null || query.ratingMax != null
        ? {
            ...(query.ratingMin != null && { gte: query.ratingMin }),
            ...(query.ratingMax != null && { lte: query.ratingMax }),
          }
        : undefined;

    return {
      booking: {
        assignedBeauticianUserId: beauticianUserId,
      },
      ...(ratingFilter && { rating: ratingFilter }),
      ...(query.status && { status: query.status }),
    };
  }

  private buildOrderBy(
    query: QueryBeauticianReviewsDto,
  ): Prisma.ReviewOrderByWithRelationInput[] {
    const direction = query.sortOrder ?? SortOrder.DESC;
    const sortBy = query.sortBy ?? BeauticianReviewSortBy.CREATED_AT;

    if (sortBy === BeauticianReviewSortBy.RATING) {
      // Stable secondary sort for ties
      return [{ rating: direction }, { createdAt: 'desc' }];
    }

    return [{ createdAt: direction }];
  }

  private mapItem(item: AdminBeauticianReviewItem) {
    return {
      id: item.id,
      rating: item.rating,
      comment: item.comment,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      bookingId: item.bookingId,
      reservationCode: item.booking.reservationCode,
      bookingDate: item.booking.bookingDate,
      serviceCompletedAt: item.booking.serviceCompletedAt,
      service: item.service,
      customer: {
        id: item.user.id,
        firstName: item.user.firstName,
        lastName: item.user.lastName,
        email: item.user.email,
      },
    };
  }
}
