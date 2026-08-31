import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SiteStatsService {
    constructor(private readonly prisma: PrismaService) { }

    /**
     * Live-computed defaults, each overridable by an admin (see
     * getOverrides/setOverrides below). "Completed bookings" combines
     * both booking systems this project has -- the marketplace Booking
     * model and the in-salon SalonBooking model -- since both represent
     * real, completed service deliveries. "Average rating" only counts
     * APPROVED reviews, matching how reviews are surfaced everywhere
     * else in this codebase.
     */
    private async computeLiveStats() {
        const [salonBookingsCompleted, marketplaceBookingsCompleted, registeredCustomers, ratingAgg, activeBranches, activeStaff] =
            await Promise.all([
                this.prisma.salonBooking.count({ where: { status: 'COMPLETED' } }),
                this.prisma.booking.count({ where: { status: 'COMPLETED' } }),
                this.prisma.user.count({ where: { role: 'USER' } }),
                this.prisma.review.aggregate({ where: { status: 'APPROVED' }, _avg: { rating: true } }),
                this.prisma.staffLocation.count({ where: { isActive: true } }),
                this.prisma.staff.count({ where: { employmentStatus: 'ACTIVE' } }),
            ]);

        return {
            completedBookings: salonBookingsCompleted + marketplaceBookingsCompleted,
            registeredCustomers,
            averageRating: ratingAgg._avg.rating != null ? Math.round(ratingAgg._avg.rating * 10) / 10 : 0,
            branches: activeBranches,
            professionals: activeStaff,
        };
    }

    /** Public shape for the homepage -- override wins over the live count wherever one is set. */
    async getPublicStats() {
        const live = await this.computeLiveStats();
        const overrides = await this.prisma.siteStats.findFirst();

        return {
            completedBookings: overrides?.completedBookingsOverride ?? live.completedBookings,
            registeredCustomers: overrides?.registeredCustomersOverride ?? live.registeredCustomers,
            averageRating: overrides?.averageRatingOverride != null ? Number(overrides.averageRatingOverride) : live.averageRating,
            branches: overrides?.branchesOverride ?? live.branches,
            professionals: overrides?.professionalsOverride ?? live.professionals,
        };
    }

    /** Admin view -- both the live figure and the current override side by side, so an admin can see what they'd be replacing. */
    async getAdminView() {
        const live = await this.computeLiveStats();
        const overrides = await this.prisma.siteStats.findFirst({
            include: { updatedBy: { select: { id: true, name: true } } },
        });

        return { live, overrides };
    }

    async setOverrides(
        input: {
            completedBookingsOverride?: number | null;
            registeredCustomersOverride?: number | null;
            averageRatingOverride?: number | null;
            branchesOverride?: number | null;
            professionalsOverride?: number | null;
        },
        actorId: string | undefined,
    ) {
        const existing = await this.prisma.siteStats.findFirst();

        const data = {
            ...(input.completedBookingsOverride !== undefined && { completedBookingsOverride: input.completedBookingsOverride }),
            ...(input.registeredCustomersOverride !== undefined && { registeredCustomersOverride: input.registeredCustomersOverride }),
            ...(input.averageRatingOverride !== undefined && { averageRatingOverride: input.averageRatingOverride }),
            ...(input.branchesOverride !== undefined && { branchesOverride: input.branchesOverride }),
            ...(input.professionalsOverride !== undefined && { professionalsOverride: input.professionalsOverride }),
            updatedById: actorId,
        };

        if (existing) {
            return this.prisma.siteStats.update({ where: { id: existing.id }, data });
        }
        return this.prisma.siteStats.create({ data });
    }
}