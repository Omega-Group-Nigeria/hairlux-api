import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SalonBookingStatus, StockMovementType } from '@prisma/client';
import { randomInt } from 'crypto';
import { BookingService } from '../booking/booking.service';
import { resolveBusinessException } from '../common/utils/business-exception.util';
import { classifyCustomerLifecycle, classifyCustomerValue, CustomerLifecycle, CustomerValue, getCustomerClassificationThresholds } from '../common/utils/customer-status.util';
import { watTodayDateStr } from '../common/utils/wat-time.util';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddSalonBookingInventoryItemDto } from './dto/add-inventory-item.dto';
import { CancelSalonBookingDto } from './dto/cancel-salon-booking.dto';
import { CreateSalonBookingDto } from './dto/create-salon-booking.dto';
import { QuerySalonBookingsDto } from './dto/query-salon-bookings.dto';
import { ReserveSalonBookingDto } from './dto/reserve-salon-booking.dto';
import { VerifyReservationDto } from './dto/verify-reservation.dto';
import { UpdateCustomerClassificationSettingsDto } from './dto/update-customer-classification-settings.dto';
import { EditSalonBookingDto, AddServiceToCompletedBookingDto } from './dto/edit-salon-booking.dto';

/**
 * Nigeria (WAT) is a fixed UTC+1 offset year-round — no daylight saving —
 * matching the same approach already used in the attendance service for
 * the identical class of bug (comparing against "now" needs to reason in
 * WAT regardless of what timezone the server process itself runs in).
 */
function watDateTimeFromParts(dateStr: string, hhmm: string): Date {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`);
}

/** Display-only Booking ID — the real, unique, sequential value underneath is bookingNumber. */
function formatBookingCode(bookingNumber: number): string {
    return `HLB-${String(bookingNumber).padStart(6, '0')}`;
}

/** Every place a booking gets sent to the frontend should carry this display field. */
function withBookingCode<T extends { bookingNumber: number }>(booking: T): T & { bookingCode: string } {
    return { ...booking, bookingCode: formatBookingCode(booking.bookingNumber) };
}

interface CustomerContactsFilterParams {
    query?: string;
    branchIds?: string[];
    dateFrom?: string;
    dateTo?: string;
    hasAccount?: boolean;
    minVisits?: number;
    maxVisits?: number;
    minSpend?: number;
    maxSpend?: number;
    minAvgSpend?: number;
    maxAvgSpend?: number;
    firstVisitFrom?: string;
    firstVisitTo?: string;
    lastVisitFrom?: string;
    lastVisitTo?: string;
    daysSinceLastVisitMin?: number;
    daysSinceLastVisitMax?: number;
    lifecycle?: CustomerLifecycle;
    value?: CustomerValue;
    serviceCategoryIds?: string[];
    serviceIds?: string[];
    page?: number;
    limit?: number;
}

const INCLUDE_FULL = {
    branch: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true, phone: true, email: true } },
    assignedStaff: { select: { id: true, name: true, staffCode: true, commissionRate: true } },
    createdBy: { select: { id: true, name: true, staffCode: true } },
    services: { include: { service: { select: { id: true, name: true } } } },
    inventoryItems: { include: { item: { select: { id: true, name: true, category: true } } } },
    commission: true,
};

@Injectable()
export class SalonBookingService {
    constructor(
        private prisma: PrismaService,
        private inventoryService: InventoryService,
        private bookingService: BookingService,
    ) { }

    async create(dto: CreateSalonBookingDto, createdById: string | undefined) {
        if (!dto.branchId) {
            throw new BadRequestException('branchId is required');
        }

        if (watDateTimeFromParts(dto.bookingDate, dto.bookingTime).getTime() < Date.now()) {
            throw new BadRequestException('Booking date/time cannot be in the past');
        }

        const exception = await resolveBusinessException(this.prisma, dto.branchId, dto.bookingDate);
        if (exception?.isClosed) {
            throw new BadRequestException(
                `This branch is closed on ${dto.bookingDate}${exception.reason ? ` (${exception.reason})` : ''} — bookings cannot be made for this date.`,
            );
        }
        if (exception && !exception.isClosed && exception.openTime && exception.closeTime) {
            const requestedTime = dto.bookingTime;
            if (requestedTime < exception.openTime || requestedTime > exception.closeTime) {
                throw new BadRequestException(
                    `On ${dto.bookingDate}, this branch's hours are ${exception.openTime}\u2013${exception.closeTime}${exception.reason ? ` (${exception.reason})` : ''} — the requested time falls outside that window.`,
                );
            }
        }

        if (dto.assignedStaffId) {
            const staff = await this.prisma.staff.findUnique({ where: { id: dto.assignedStaffId } });
            if (!staff) throw new NotFoundException('Assigned staff member not found');
            if (staff.locationId !== dto.branchId) {
                throw new BadRequestException('The assigned staff member is not based at this branch');
            }
        }

        const serviceIds = dto.services.map((s) => s.serviceId);
        const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
        if (services.length !== new Set(serviceIds).size) {
            throw new BadRequestException('One or more services were not found');
        }

        let inventoryLines: { itemId: string; quantity: number; unitPrice: number | null }[] = [];
        if (dto.inventoryItems?.length) {
            inventoryLines = await this.resolveInventoryLines(dto.branchId, dto.inventoryItems);
        }

        const servicePrices = await this.resolveServicePrices(dto.branchId, serviceIds);
        const serviceLines = dto.services.map((line) => {
            const service = services.find((s) => s.id === line.serviceId)!;
            return { serviceId: service.id, price: servicePrices.get(service.id) ?? Number(service.walkInPrice), quantity: line.quantity ?? 1 };
        });

        const totalAmount = this.computeTotal(serviceLines, inventoryLines);

        const customerId = dto.customerPhone
            ? (await this.findOrCreateCustomer(dto.customerName, dto.customerPhone, dto.customerEmail, dto.linkToVerifiedUser)).id
            : undefined;

        const booking = await this.prisma.salonBooking.create({
            data: {
                branchId: dto.branchId,
                customerId,
                customerName: dto.customerName,
                customerPhone: dto.customerPhone,
                assignedStaffId: dto.assignedStaffId,
                createdById,
                bookingDate: new Date(dto.bookingDate),
                bookingTime: dto.bookingTime,
                notes: dto.notes,
                totalAmount,
                services: { create: serviceLines },
                inventoryItems: inventoryLines.length ? { create: inventoryLines } : undefined,
            },
            include: INCLUDE_FULL,
        });

        return withBookingCode(booking);
    }

    /** Matches by phone (the de-dup key) — repeat visits reuse the same Customer row. */
    /**
     * Looks up existing customers by name or phone, for the "look this
     * person up instead of retyping their details" flow when starting a
     * new booking. Searches both the lightweight Customer table (people
     * who've had a walk-in before, may or may not have an app account) and
     * real User accounts (role USER — people with an app account who may
     * never have walked in before). A Customer already linked to a User is
     * deduplicated so it doesn't show up twice.
     */
    /**
     * Full paginated Customer Contacts list, for the Contacts module — distinct
     * from searchCustomers, which is a lightweight capped lookup used only
     * while creating a booking.
     */
    async findAllCustomers(params: CustomerContactsFilterParams) {
        const {
            query, branchIds, dateFrom, dateTo, hasAccount,
            minVisits, maxVisits, minSpend, maxSpend, minAvgSpend, maxAvgSpend,
            firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
            daysSinceLastVisitMin, daysSinceLastVisitMax,
            lifecycle, value, serviceCategoryIds, serviceIds,
            page = 1, limit = 20,
        } = params;

        const where: any = query
            ? { OR: [{ name: { contains: query, mode: 'insensitive' as const } }, { phone: { contains: query } }] }
            : {};

        if (hasAccount !== undefined) {
            where.userId = hasAccount ? { not: null } : null;
        }

        if (branchIds?.length || dateFrom || dateTo) {
            where.salonBookings = {
                some: {
                    ...(branchIds?.length && { branchId: { in: branchIds } }),
                    ...((dateFrom || dateTo) && {
                        bookingDate: {
                            ...(dateFrom && { gte: new Date(dateFrom) }),
                            ...(dateTo && { lte: new Date(dateTo) }),
                        },
                    }),
                },
            };
        }

        // Every filter below (visits/spend/dates/lifecycle/value/service)
        // depends on each customer's FULL booking history, not a single
        // row — not expressible as a plain Prisma where clause without a
        // raw aggregation query. So this fetches every DB-filterable
        // match, computes stats in memory, filters, and paginates last —
        // applying pagination before that filtering would silently return
        // short pages. Fine at Hairlux's actual customer volume; not
        // something to do at a scale of hundreds of thousands of rows.
        const needsValueFilter = [
            minVisits, maxVisits, minSpend, maxSpend, minAvgSpend, maxAvgSpend,
            firstVisitFrom, firstVisitTo, lastVisitFrom, lastVisitTo,
            daysSinceLastVisitMin, daysSinceLastVisitMax,
            lifecycle, value, serviceCategoryIds?.length, serviceIds?.length,
        ].some((v) => v !== undefined);

        const [allMatching, dbTotal] = await Promise.all([
            this.prisma.customer.findMany({
                where,
                ...(needsValueFilter ? {} : { skip: (page - 1) * limit, take: limit }),
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.customer.count({ where }),
        ]);

        const customerIds = allMatching.map((c) => c.id);
        const bookings = customerIds.length
            ? await this.prisma.salonBooking.findMany({
                where: { customerId: { in: customerIds } },
                select: {
                    customerId: true,
                    status: true,
                    totalAmount: true,
                    bookingDate: true,
                    branch: { select: { id: true, name: true } },
                    services: { select: { service: { select: { id: true, name: true, categoryId: true, category: { select: { id: true, name: true } } } } } },
                },
            })
            : [];

        const statsByCustomer = new Map<string, {
            visitCount: number; totalSpend: number; branches: Map<string, string>;
            firstVisitDate: Date | null; lastVisitDate: Date | null;
            serviceIds: Set<string>; serviceCategoryIds: Set<string>; serviceNames: Set<string>;
        }>();
        for (const b of bookings) {
            if (!b.customerId) continue;
            const s = statsByCustomer.get(b.customerId) ?? {
                visitCount: 0, totalSpend: 0, branches: new Map(),
                firstVisitDate: null, lastVisitDate: null,
                serviceIds: new Set(), serviceCategoryIds: new Set(), serviceNames: new Set(),
            };
            s.branches.set(b.branch.id, b.branch.name);
            if (b.status === 'COMPLETED') {
                s.visitCount += 1;
                s.totalSpend += Number(b.totalAmount);
                if (!s.firstVisitDate || b.bookingDate < s.firstVisitDate) s.firstVisitDate = b.bookingDate;
                if (!s.lastVisitDate || b.bookingDate > s.lastVisitDate) s.lastVisitDate = b.bookingDate;
                for (const line of b.services) {
                    s.serviceIds.add(line.service.id);
                    s.serviceNames.add(line.service.name);
                    s.serviceCategoryIds.add(line.service.categoryId);
                }
            }
            statsByCustomer.set(b.customerId, s);
        }

        const now = new Date();
        const { value: valueThresholds, lifecycle: lifecycleThresholds } = await getCustomerClassificationThresholds(this.prisma);
        let withStats = allMatching.map((c) => {
            const s = statsByCustomer.get(c.id);
            const visitCount = s?.visitCount ?? 0;
            const totalSpend = s?.totalSpend ?? 0;
            const averageSpend = visitCount > 0 ? totalSpend / visitCount : 0;
            const daysSinceLastVisit = s?.lastVisitDate ? Math.floor((now.getTime() - s.lastVisitDate.getTime()) / 86400000) : null;

            return {
                ...c,
                visitCount,
                totalSpend,
                averageSpend,
                branches: s ? Array.from(s.branches.values()) : [],
                firstVisitDate: s?.firstVisitDate ?? null,
                lastVisitDate: s?.lastVisitDate ?? null,
                daysSinceLastVisit,
                servicesPurchased: s ? Array.from(s.serviceNames) : [],
                serviceIds: s ? Array.from(s.serviceIds) : [],
                serviceCategoryIds: s ? Array.from(s.serviceCategoryIds) : [],
                // Lifecycle and Value are independent dimensions (per spec) —
                // never merge these into a single status field.
                lifecycle: classifyCustomerLifecycle({
                    lastVisitDate: s?.lastVisitDate ?? null,
                    completedVisitCount: visitCount,
                    accountCreatedAt: c.createdAt,
                    now,
                    thresholds: lifecycleThresholds,
                }),
                value: classifyCustomerValue(totalSpend, valueThresholds),
            };
        });

        if (minVisits !== undefined) withStats = withStats.filter((c) => c.visitCount >= minVisits);
        if (maxVisits !== undefined) withStats = withStats.filter((c) => c.visitCount <= maxVisits);
        if (minSpend !== undefined) withStats = withStats.filter((c) => c.totalSpend >= minSpend);
        if (maxSpend !== undefined) withStats = withStats.filter((c) => c.totalSpend <= maxSpend);
        if (minAvgSpend !== undefined) withStats = withStats.filter((c) => c.averageSpend >= minAvgSpend);
        if (maxAvgSpend !== undefined) withStats = withStats.filter((c) => c.averageSpend <= maxAvgSpend);
        if (firstVisitFrom) withStats = withStats.filter((c) => c.firstVisitDate && c.firstVisitDate >= new Date(firstVisitFrom));
        if (firstVisitTo) withStats = withStats.filter((c) => c.firstVisitDate && c.firstVisitDate <= new Date(firstVisitTo));
        if (lastVisitFrom) withStats = withStats.filter((c) => c.lastVisitDate && c.lastVisitDate >= new Date(lastVisitFrom));
        if (lastVisitTo) withStats = withStats.filter((c) => c.lastVisitDate && c.lastVisitDate <= new Date(lastVisitTo));
        if (daysSinceLastVisitMin !== undefined) withStats = withStats.filter((c) => c.daysSinceLastVisit !== null && c.daysSinceLastVisit >= daysSinceLastVisitMin);
        if (daysSinceLastVisitMax !== undefined) withStats = withStats.filter((c) => c.daysSinceLastVisit !== null && c.daysSinceLastVisit <= daysSinceLastVisitMax);
        if (lifecycle) withStats = withStats.filter((c) => c.lifecycle === lifecycle);
        if (value) withStats = withStats.filter((c) => c.value === value);
        if (serviceCategoryIds?.length) withStats = withStats.filter((c) => c.serviceCategoryIds.some((id) => serviceCategoryIds.includes(id)));
        if (serviceIds?.length) withStats = withStats.filter((c) => c.serviceIds.some((id) => serviceIds.includes(id)));

        const total = needsValueFilter ? withStats.length : dbTotal;
        const data = needsValueFilter ? withStats.slice((page - 1) * limit, (page - 1) * limit + limit) : withStats;

        return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    /**
     * Performance cards for the Customer Contacts page — computed over the
     * SAME filtered set findAllCustomers would return (minus pagination),
     * so the cards and the table always agree with each other.
     */
    async getCustomerContactsPerformance(params: Omit<CustomerContactsFilterParams, 'page' | 'limit'>) {
        const { data } = await this.findAllCustomers({ ...params, page: 1, limit: Number.MAX_SAFE_INTEGER });

        const lifecycleCounts: Record<CustomerLifecycle, number> = { NEVER_VISITED: 0, NEW: 0, ACTIVE: 0, AT_RISK: 0, DORMANT: 0, INACTIVE: 0 };
        const valueCounts: Record<CustomerValue, number> = { STANDARD: 0, PREMIUM: 0, VIP: 0 };
        let totalSpend = 0;
        let totalVisits = 0;
        for (const c of data) {
            lifecycleCounts[c.lifecycle as CustomerLifecycle] += 1;
            valueCounts[c.value as CustomerValue] += 1;
            totalSpend += c.totalSpend;
            totalVisits += c.visitCount;
        }

        return {
            totalCustomers: data.length,
            newCustomers: lifecycleCounts.NEW,
            activeCustomers: lifecycleCounts.ACTIVE,
            atRiskCustomers: lifecycleCounts.AT_RISK,
            dormantCustomers: lifecycleCounts.DORMANT,
            inactiveCustomers: lifecycleCounts.INACTIVE,
            neverVisitedCustomers: lifecycleCounts.NEVER_VISITED,
            standardValueCustomers: valueCounts.STANDARD,
            premiumCustomers: valueCounts.PREMIUM,
            vipCustomers: valueCounts.VIP,
            totalSpend,
            averageSpend: data.length > 0 ? totalSpend / data.length : 0,
            totalVisits,
        };
    }

    /** Full profile/history for a single Customer Contact — the drill-down view when an admin clicks a customer. */
    async getCustomerProfile(customerId: string) {
        const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) throw new NotFoundException('Customer not found');

        const bookings = await this.prisma.salonBooking.findMany({
            where: { customerId },
            orderBy: { bookingDate: 'desc' },
            include: {
                branch: { select: { id: true, name: true } },
                services: { select: { price: true, quantity: true, service: { select: { id: true, name: true, category: { select: { id: true, name: true } } } } } },
            },
        });

        const completed = bookings.filter((b) => b.status === 'COMPLETED');
        const totalSpend = completed.reduce((sum, b) => sum + Number(b.totalAmount), 0);
        const visitCount = completed.length;
        const firstVisitDate = completed.length ? completed[completed.length - 1].bookingDate : null;
        const lastVisitDate = completed.length ? completed[0].bookingDate : null;
        const branchesVisited = Array.from(new Map(bookings.map((b) => [b.branch.id, b.branch.name])).entries()).map(([id, name]) => ({ id, name }));

        const { value: valueThresholds, lifecycle: lifecycleThresholds } = await getCustomerClassificationThresholds(this.prisma);

        return {
            customer,
            firstVisitDate,
            lastVisitDate,
            visitCount,
            totalSpend,
            averageSpend: visitCount > 0 ? totalSpend / visitCount : 0,
            branchesVisited,
            lifecycle: classifyCustomerLifecycle({
                lastVisitDate,
                completedVisitCount: visitCount,
                accountCreatedAt: customer.createdAt,
                thresholds: lifecycleThresholds,
            }),
            value: classifyCustomerValue(totalSpend, valueThresholds),
            bookingHistory: bookings.map((b) => ({
                id: b.id,
                bookingDate: b.bookingDate,
                bookingTime: b.bookingTime,
                status: b.status,
                totalAmount: Number(b.totalAmount),
                branch: b.branch,
                services: b.services.map((s) => ({ name: s.service.name, category: s.service.category.name, price: Number(s.price), quantity: s.quantity })),
            })),
        };
    }

    /** Both dimensions live on one settings row — always returned together, since the admin config page edits them as one form. */
    async getCustomerClassificationSettings() {
        const row = await this.prisma.customerValueSettings.findFirst();
        return {
            premiumSpendThreshold: row ? Number(row.premiumSpendThreshold) : 50_000,
            vipSpendThreshold: row ? Number(row.vipSpendThreshold) : 200_000,
            newAccountAgeDays: row ? row.newAccountAgeDays : 30,
            newVisitCountThreshold: row ? row.newVisitCountThreshold : 3,
            activeDaysThreshold: row ? row.activeDaysThreshold : 30,
            atRiskDaysThreshold: row ? row.atRiskDaysThreshold : 90,
            dormantDaysThreshold: row ? row.dormantDaysThreshold : 180,
        };
    }

    async updateCustomerClassificationSettings(dto: UpdateCustomerClassificationSettingsDto, updatedById: string | undefined) {
        const existing = await this.prisma.customerValueSettings.findFirst();
        const data = { ...dto, updatedById: updatedById ?? null };

        return existing
            ? this.prisma.customerValueSettings.update({ where: { id: existing.id }, data })
            : this.prisma.customerValueSettings.create({ data });
    }

    async searchCustomers(query: string) {
        const q = query.trim();
        if (!q) return [];

        const customers = await this.prisma.customer.findMany({
            where: {
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q } },
                ],
            },
            take: 10,
        });

        const users = await this.prisma.user.findMany({
            where: {
                role: 'USER',
                OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { phone: { contains: q } },
                ],
            },
            take: 10,
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        });

        const linkedUserIds = new Set(customers.filter((c) => c.userId).map((c) => c.userId));

        const fromCustomers = customers.map((c) => ({
            source: 'customer' as const,
            customerId: c.id,
            userId: c.userId,
            name: c.name,
            phone: c.phone,
            email: c.email,
        }));

        const fromUsers = users
            .filter((u) => !linkedUserIds.has(u.id))
            .map((u) => ({
                source: 'user' as const,
                customerId: null,
                userId: u.id,
                name: `${u.firstName} ${u.lastName}`.trim(),
                phone: u.phone,
                email: u.email,
            }));

        return [...fromCustomers, ...fromUsers].slice(0, 15);
    }

    /**
     * Combined Salon Bookings overview — merges SalonBooking rows with the
     * legacy Booking table's WALK_IN entries (still the live customer
     * self-service path), so admin sees one consistent picture of "what
     * happened at the salon" regardless of which table a given booking
     * actually lives in. HOME_SERVICE legacy bookings are deliberately
     * excluded — those belong to the existing marketplace Booking
     * Management dashboard, not this one.
     */
    async getOverview(filters: { dateFrom?: string; dateTo?: string; branchId?: string; source?: 'salon_booking' | 'booking' | 'all' }) {
        const dateFilter = (filters.dateFrom || filters.dateTo)
            ? { gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined, lte: filters.dateTo ? new Date(filters.dateTo) : undefined }
            : undefined;
        const wantSalonBookings = !filters.source || filters.source === 'all' || filters.source === 'salon_booking';
        const wantLegacyBookings = !filters.source || filters.source === 'all' || filters.source === 'booking';

        const salonBookings = wantSalonBookings
            ? await this.prisma.salonBooking.findMany({
                where: {
                    ...(filters.branchId && { branchId: filters.branchId }),
                    ...(dateFilter && { bookingDate: dateFilter }),
                },
                include: {
                    branch: { select: { id: true, name: true } },
                    assignedStaff: { select: { id: true, name: true } },
                },
                orderBy: { bookingDate: 'desc' },
            })
            : [];

        const legacyBookings = wantLegacyBookings
            ? await this.prisma.booking.findMany({
                where: {
                    bookingType: 'WALK_IN',
                    ...(filters.branchId && { branchId: filters.branchId }),
                    ...(dateFilter && { bookingDate: dateFilter }),
                },
                include: {
                    branch: { select: { id: true, name: true } },
                    assignedInHouseStaff: { select: { id: true, name: true } },
                    user: { select: { firstName: true, lastName: true } },
                },
                orderBy: { bookingDate: 'desc' },
            })
            : [];

        const normalizeSalonStatus = (status: string): 'completed' | 'pending' | 'cancelled' => {
            if (status === 'COMPLETED') return 'completed';
            if (status === 'CANCELLED' || status === 'NO_SHOW') return 'cancelled';
            return 'pending';
        };
        const normalizeLegacyStatus = (status: string): 'completed' | 'pending' | 'cancelled' => {
            if (status === 'COMPLETED') return 'completed';
            if (status === 'CANCELLED') return 'cancelled';
            return 'pending';
        };

        const rows = [
            ...salonBookings.map((b) => ({
                id: b.id,
                source: 'salon_booking' as const,
                branchName: b.branch?.name ?? null,
                staffName: b.assignedStaff?.name ?? null,
                customerName: b.customerName,
                bookingDate: b.bookingDate,
                totalAmount: Number(b.totalAmount),
                status: b.status,
                bucket: normalizeSalonStatus(b.status),
            })),
            ...legacyBookings.map((b) => ({
                id: b.id,
                source: 'booking' as const,
                branchName: b.branch?.name ?? null,
                staffName: b.assignedInHouseStaff?.name ?? null,
                customerName: b.guestName || (b.user ? `${b.user.firstName} ${b.user.lastName}`.trim() : null),
                bookingDate: b.bookingDate,
                totalAmount: Number(b.totalAmount),
                status: b.status,
                bucket: normalizeLegacyStatus(b.status),
            })),
        ].sort((a, z) => z.bookingDate.getTime() - a.bookingDate.getTime());

        const summary = {
            totalBookings: rows.length,
            // Realized revenue — only what's actually been completed, not
            // pending or cancelled bookings that never rendered service.
            totalRevenue: rows.filter((r) => r.bucket === 'completed').reduce((sum, r) => sum + r.totalAmount, 0),
            completed: rows.filter((r) => r.bucket === 'completed').length,
            pending: rows.filter((r) => r.bucket === 'pending').length,
            cancelled: rows.filter((r) => r.bucket === 'cancelled').length,
        };

        return { summary, bookings: rows };
    }

    /**
     * Hard-deletes a SalonBooking — Super Admin only, and only for
     * SalonBooking rows (never the legacy marketplace Booking table, which
     * has its own separate lifecycle and no delete concept here). Cascades
     * to its service lines, inventory lines, and commission record.
     */
    async deleteBooking(id: string) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');
        await this.prisma.salonBooking.delete({ where: { id } });
        return { deleted: true, id };
    }

    private async findOrCreateCustomer(name: string, phone: string, email?: string, linkToVerifiedUser?: boolean) {
        const existing = await this.prisma.customer.findUnique({ where: { phone } });

        // Only actually link when staff explicitly confirmed it (see
        // checkPhoneMatch) -- a phone matching a verified account is never
        // enough on its own to silently attach someone's visit history to
        // that account.
        let verifiedUserId: string | undefined;
        if (linkToVerifiedUser) {
            const verifiedUser = await this.prisma.user.findFirst({ where: { phone, phoneVerified: true } });
            verifiedUserId = verifiedUser?.id;
        }

        if (existing) {
            if (verifiedUserId && existing.userId !== verifiedUserId) {
                return this.prisma.customer.update({ where: { id: existing.id }, data: { userId: verifiedUserId } });
            }
            return existing;
        }
        return this.prisma.customer.create({ data: { name, phone, email, userId: verifiedUserId } });
    }

    /**
     * Called as staff types/confirms a phone number on the booking form --
     * before creation, not as a side effect of it. Tells the frontend
     * whether to show an "Is this <name>? Link this visit to their
     * account?" prompt at all: no prompt when there's no verified match,
     * and no prompt when the existing Customer record (if any) is already
     * linked to that exact account, since there's nothing left to confirm.
     */
    async checkPhoneMatch(phone: string) {
        const verifiedUser = await this.prisma.user.findFirst({
            where: { phone, phoneVerified: true },
            select: { id: true, firstName: true, lastName: true },
        });
        if (!verifiedUser) {
            return { hasMatch: false as const };
        }

        const existingCustomer = await this.prisma.customer.findUnique({ where: { phone } });
        if (existingCustomer?.userId === verifiedUser.id) {
            return { hasMatch: false as const }; // already linked -- nothing to confirm
        }

        return {
            hasMatch: true as const,
            accountName: `${verifiedUser.firstName} ${verifiedUser.lastName}`.trim(),
        };
    }

    private generateReservationCode(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
        let code = 'HLS-';
        for (let i = 0; i < 6; i++) {
            code += chars[randomInt(chars.length)];
        }
        return code;
    }

    /**
     * Customer-facing — reserving a salon visit in advance from
     * hairlux-user-interface. No Stylist assigned yet (that happens when the
     * customer walks in and staff verifies the code) and no `createdById`
     * (nobody on staff created this).
     */
    async reserve(dto: ReserveSalonBookingDto) {
        const branch = await this.prisma.staffLocation.findUnique({ where: { id: dto.branchId } });
        if (!branch) throw new NotFoundException('Branch not found');

        if (watDateTimeFromParts(dto.bookingDate, dto.bookingTime).getTime() < Date.now()) {
            throw new BadRequestException('Booking date/time cannot be in the past');
        }

        const exception = await resolveBusinessException(this.prisma, dto.branchId, dto.bookingDate);
        if (exception?.isClosed) {
            throw new BadRequestException(
                `This branch is closed on ${dto.bookingDate}${exception.reason ? ` (${exception.reason})` : ''} — bookings cannot be made for this date.`,
            );
        }
        if (exception && !exception.isClosed && exception.openTime && exception.closeTime) {
            const requestedTime = dto.bookingTime;
            if (requestedTime < exception.openTime || requestedTime > exception.closeTime) {
                throw new BadRequestException(
                    `On ${dto.bookingDate}, this branch's hours are ${exception.openTime}\u2013${exception.closeTime}${exception.reason ? ` (${exception.reason})` : ''} — the requested time falls outside that window.`,
                );
            }
        }

        const serviceIds = dto.services.map((s) => s.serviceId);
        const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
        if (services.length !== new Set(serviceIds).size) {
            throw new BadRequestException('One or more services were not found');
        }

        const servicePrices = await this.resolveServicePrices(dto.branchId, serviceIds);
        const serviceLines = dto.services.map((line) => {
            const service = services.find((s) => s.id === line.serviceId)!;
            return { serviceId: service.id, price: servicePrices.get(service.id) ?? Number(service.walkInPrice), quantity: line.quantity ?? 1 };
        });
        const totalAmount = this.computeTotal(serviceLines, []);

        const customer = await this.findOrCreateCustomer(dto.customerName, dto.customerPhone, dto.customerEmail);

        // Reservation codes are unique — collisions are astronomically rare
        // with 6 chars from a 32-symbol alphabet, but retry once just in case.
        let reservationCode = this.generateReservationCode();
        for (let attempt = 0; attempt < 3; attempt++) {
            const clash = await this.prisma.salonBooking.findUnique({ where: { reservationCode } });
            if (!clash) break;
            reservationCode = this.generateReservationCode();
        }

        const booking = await this.prisma.salonBooking.create({
            data: {
                branchId: dto.branchId,
                customerId: customer.id,
                customerName: dto.customerName,
                customerPhone: dto.customerPhone,
                bookingDate: new Date(dto.bookingDate),
                bookingTime: dto.bookingTime,
                notes: dto.notes,
                totalAmount,
                reservationCode,
                services: { create: serviceLines },
            },
            include: INCLUDE_FULL,
        });
        return withBookingCode(booking);
    }

    /**
     * Looks up a reservation by code. `restrictToBranchId` is passed for
     * staff (their own branch only) and omitted for admin (any branch).
     */
    async findByReservationCode(code: string, restrictToBranchId?: string) {
        const booking = await this.prisma.salonBooking.findUnique({
            where: { reservationCode: code },
            include: INCLUDE_FULL,
        });
        if (!booking) throw new NotFoundException('No reservation found with this code');
        if (restrictToBranchId && booking.branchId !== restrictToBranchId) {
            throw new NotFoundException('No reservation found with this code'); // don't leak cross-branch existence
        }
        return withBookingCode(booking);
    }

    /** Assigns the Stylist and marks the reservation redeemed — the moment the customer actually walks in. */
    async verifyReservation(id: string, dto: VerifyReservationDto, restrictToBranchId?: string) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');
        if (!booking.reservationCode) {
            throw new BadRequestException('This booking has no reservation code to verify — it was not booked in advance');
        }
        if (booking.reservationUsed) {
            throw new BadRequestException('This reservation has already been used');
        }
        if (restrictToBranchId && booking.branchId !== restrictToBranchId) {
            throw new NotFoundException('No reservation found with this code');
        }

        const staff = await this.prisma.staff.findUnique({ where: { id: dto.assignedStaffId } });
        if (!staff) throw new NotFoundException('Assigned staff member not found');
        if (staff.locationId !== booking.branchId) {
            throw new BadRequestException('The assigned staff member is not based at this branch');
        }

        await this.prisma.salonBooking.update({
            where: { id },
            data: { assignedStaffId: dto.assignedStaffId, reservationUsed: true },
        });

        return this.findOne(id);
    }

    /**
     * Looks up a reservation code across both booking systems — SalonBooking
     * (staff/admin-created walk-ins and advance reservations) and the older
     * marketplace Booking table (still the live path for customer
     * self-service bookings, including WALK_IN type, since it's the one
     * with working wallet deduction). SalonBooking is checked first since
     * that's the more common staff-facing case.
     */
    async findReservationAnywhere(code: string, restrictToBranchId?: string) {
        const salonBooking = await this.prisma.salonBooking.findUnique({
            where: { reservationCode: code },
            include: INCLUDE_FULL,
        });
        if (salonBooking) {
            if (restrictToBranchId && salonBooking.branchId !== restrictToBranchId) {
                throw new NotFoundException('No reservation found with this code');
            }
            return { source: 'salon_booking' as const, booking: withBookingCode(salonBooking) };
        }

        let legacyBooking: any;
        try {
            legacyBooking = await this.bookingService.adminFindByReservationCode(code);
        } catch {
            throw new NotFoundException('No reservation found with this code');
        }
        const legacyBranchId = legacyBooking?.branchId ?? legacyBooking?.branch?.id;
        if (restrictToBranchId && legacyBranchId !== restrictToBranchId) {
            throw new NotFoundException('No reservation found with this code');
        }
        return { source: 'booking' as const, booking: legacyBooking };
    }

    /**
     * Verifies a reservation code found in either table. Both paths now
     * require picking which in-house Stylist is serving the customer — a
     * self-service customer booking never has one assigned at booking time
     * (unlike an admin/staff-created SalonBooking walk-in), so verification
     * is the natural moment to record it, for either table.
     */
    async verifyReservationAnywhere(code: string, assignedStaffId: string | undefined, restrictToBranchId?: string) {
        if (!assignedStaffId) {
            throw new BadRequestException('Select which staff member is serving this customer');
        }

        const salonBooking = await this.prisma.salonBooking.findUnique({ where: { reservationCode: code } });
        if (salonBooking) {
            if (restrictToBranchId && salonBooking.branchId !== restrictToBranchId) {
                throw new NotFoundException('No reservation found with this code');
            }
            const updated = await this.verifyReservation(salonBooking.id, { assignedStaffId }, restrictToBranchId);
            return { source: 'salon_booking' as const, booking: updated };
        }

        let legacyBooking: any;
        try {
            legacyBooking = await this.bookingService.adminFindByReservationCode(code);
        } catch {
            throw new NotFoundException('No reservation found with this code');
        }
        const legacyBranchId = legacyBooking?.branchId ?? legacyBooking?.branch?.id;
        if (restrictToBranchId && legacyBranchId !== restrictToBranchId) {
            throw new NotFoundException('No reservation found with this code');
        }

        const staff = await this.prisma.staff.findUnique({ where: { id: assignedStaffId } });
        if (!staff) throw new NotFoundException('Assigned staff member not found');
        if (restrictToBranchId && staff.locationId !== restrictToBranchId) {
            throw new BadRequestException('The assigned staff member is not based at this branch');
        }

        await this.bookingService.useReservation(code);
        const updated = await this.prisma.booking.update({
            where: { reservationCode: code },
            data: { assignedInHouseStaffId: assignedStaffId },
            include: { assignedInHouseStaff: { select: { id: true, name: true, staffCode: true } } },
        });
        return { source: 'booking' as const, booking: updated };
    }

    /**
     * Real commission summary for the logged-in staff member — this month's
     * total, all-time total, a monthly breakdown for the last 6 months, and
     * the individual booking-level entries behind it. No bonus-target or
     * payout-tracking concepts here — those don't exist as real backend
     * features yet, so this only ever shows what SalonBookingCommission
     * actually has recorded.
     */
    async getMyCommissionSummary(staffId: string) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const commissions = await this.prisma.salonBookingCommission.findMany({
            where: { staffId },
            orderBy: { calculatedAt: 'desc' },
            include: {
                booking: {
                    select: {
                        id: true,
                        customerName: true,
                        bookingDate: true,
                        totalAmount: true,
                        services: { include: { service: { select: { name: true } } } },
                    },
                },
            },
        });

        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let thisMonthTotal = 0;
        let bookingsThisMonth = 0;
        let allTimeTotal = 0;
        const monthlyMap = new Map<string, { total: number; count: number }>();

        for (const c of commissions) {
            const amount = Number(c.amount);
            allTimeTotal += amount;

            const calcDate = new Date(c.calculatedAt);
            if (calcDate >= startOfThisMonth) {
                thisMonthTotal += amount;
                bookingsThisMonth += 1;
            }

            const monthKey = `${calcDate.getFullYear()}-${String(calcDate.getMonth() + 1).padStart(2, '0')}`;
            const existing = monthlyMap.get(monthKey) ?? { total: 0, count: 0 };
            existing.total += amount;
            existing.count += 1;
            monthlyMap.set(monthKey, existing);
        }

        const monthlyBreakdown = Array.from(monthlyMap.entries())
            .map(([month, v]) => ({ month, total: v.total, count: v.count }))
            .sort((a, b) => (a.month < b.month ? 1 : -1))
            .slice(0, 6);

        const entries = commissions.map((c) => ({
            id: c.id,
            bookingId: c.bookingId,
            customerName: c.booking?.customerName ?? null,
            bookingDate: c.booking?.bookingDate ?? null,
            serviceNames: c.booking?.services?.map((s) => s.service?.name).filter(Boolean) ?? [],
            bookingTotal: c.booking?.totalAmount != null ? Number(c.booking.totalAmount) : null,
            amount: Number(c.amount),
            rateApplied: Number(c.rateApplied),
            calculatedAt: c.calculatedAt,
        }));

        return {
            commissionRate: staff.commissionRate != null ? Number(staff.commissionRate) : null,
            thisMonthTotal,
            bookingsThisMonth,
            allTimeTotal,
            monthlyBreakdown,
            entries,
        };
    }

    /**
     * Today's Stylist Performance — branch-scoped, today only (WAT), never
     * historical. "Completed services" here means completed bookings, not
     * individual service line items within a booking — matching how a
     * salon typically talks about "how many appointments a stylist got
     * through today," not a line-item count.
     */
    async getTodayStylistPerformance(branchId: string) {
        const todayStr = watTodayDateStr(new Date());

        const bookings = await this.prisma.salonBooking.findMany({
            where: {
                branchId,
                status: SalonBookingStatus.COMPLETED,
                bookingDate: new Date(todayStr),
            },
            include: { assignedStaff: { select: { id: true, name: true } } },
        });

        const byStaff = new Map<string, { staffId: string; staffName: string; completedServices: number; totalGenerated: number }>();
        for (const b of bookings) {
            if (!b.assignedStaffId) continue;
            const entry = byStaff.get(b.assignedStaffId) ?? {
                staffId: b.assignedStaffId,
                staffName: b.assignedStaff?.name ?? 'Unknown',
                completedServices: 0,
                totalGenerated: 0,
            };
            entry.completedServices += 1;
            entry.totalGenerated += Number(b.totalAmount);
            byStaff.set(b.assignedStaffId, entry);
        }

        return Array.from(byStaff.values()).sort((a, z) => z.totalGenerated - a.totalGenerated);
    }

    /**
     * Resolves the effective walk-in price per service for a given branch —
     * the branch's BranchService.walkInPrice override when one exists,
     * otherwise the service's own base walkInPrice. This is the same
     * override mechanism ServiceCatalogService applies for display; booking
     * creation must use it too, or a branch's price override never actually
     * gets charged.
     */
    private async resolveServicePrices(branchId: string, serviceIds: string[]): Promise<Map<string, number>> {
        const overrides = await this.prisma.branchService.findMany({
            where: { branchId, serviceId: { in: serviceIds } },
            select: { serviceId: true, walkInPrice: true },
        });
        const overrideMap = new Map(overrides.map((o) => [o.serviceId, o.walkInPrice != null ? Number(o.walkInPrice) : null]));

        const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
        const priceMap = new Map<string, number>();
        for (const service of services) {
            const override = overrideMap.get(service.id);
            priceMap.set(service.id, override != null ? override : Number(service.walkInPrice));
        }
        return priceMap;
    }

    private async resolveInventoryLines(branchId: string, lines: { itemId: string; quantity: number }[]) {
        const itemIds = lines.map((l) => l.itemId);
        const items = await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } });

        return lines.map((line) => {
            const item = items.find((i) => i.id === line.itemId);
            if (!item) throw new NotFoundException(`Inventory item ${line.itemId} not found`);
            if (item.branchId !== branchId) {
                throw new BadRequestException(`Inventory item "${item.name}" does not belong to this branch`);
            }
            return {
                itemId: item.id,
                quantity: line.quantity,
                unitPrice: item.category === 'FOR_SALE' ? Number(item.price ?? 0) : null,
            };
        });
    }

    private computeTotal(
        serviceLines: { price: number; quantity: number }[],
        inventoryLines: { unitPrice: number | null; quantity: number }[],
    ) {
        const serviceTotal = serviceLines.reduce((sum, l) => sum + l.price * l.quantity, 0);
        const itemTotal = inventoryLines.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);
        return serviceTotal + itemTotal;
    }

    async findAll(query: QuerySalonBookingsDto) {
        const { branchId, assignedStaffId, status, date, search, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(branchId && { branchId }),
            ...(assignedStaffId && { assignedStaffId }),
            ...(status && { status }),
            ...(date && { bookingDate: new Date(date) }),
        };

        if (search) {
            const trimmed = search.trim();
            // Accepts "HLB-001057", "1057", or "001057" as a Booking ID
            // search, alongside the usual name/phone match — a search that
            // isn't a valid Booking ID still works fine as a plain
            // name/phone search via the same OR clause.
            const numericPart = trimmed.replace(/^HLB-?/i, '').replace(/^0+(?=\d)/, '');
            const asBookingNumber = numericPart ? Number(numericPart) : NaN;

            where.OR = [
                { customerName: { contains: trimmed, mode: 'insensitive' as const } },
                { customerPhone: { contains: trimmed } },
                ...(Number.isFinite(asBookingNumber) && asBookingNumber > 0 ? [{ bookingNumber: asBookingNumber }] : []),
            ];
        }

        const [bookings, total] = await Promise.all([
            this.prisma.salonBooking.findMany({
                where,
                include: INCLUDE_FULL,
                orderBy: [{ bookingDate: 'desc' }, { bookingTime: 'desc' }],
                skip,
                take: limit,
            }),
            this.prisma.salonBooking.count({ where }),
        ]);

        return { data: bookings.map(withBookingCode), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id }, include: INCLUDE_FULL });
        if (!booking) throw new NotFoundException('Booking not found');
        return withBookingCode(booking);
    }

    async addInventoryItem(bookingId: string, dto: AddSalonBookingInventoryItemDto) {
        const booking = await this.findOne(bookingId);
        this.assertModifiable(booking.status as SalonBookingStatus);

        const [line] = await this.resolveInventoryLines(booking.branchId, [dto]);

        await this.prisma.salonBookingInventoryItem.create({
            data: { bookingId, itemId: line.itemId, quantity: line.quantity, unitPrice: line.unitPrice },
        });

        return this.recomputeTotal(bookingId);
    }

    private async recomputeTotal(bookingId: string) {
        const booking = await this.prisma.salonBooking.findUnique({
            where: { id: bookingId },
            include: { services: true, inventoryItems: true },
        });
        if (!booking) throw new NotFoundException('Booking not found');

        const total = this.computeTotal(
            booking.services.map((s) => ({ price: Number(s.price), quantity: s.quantity })),
            booking.inventoryItems.map((i) => ({ unitPrice: i.unitPrice ? Number(i.unitPrice) : null, quantity: i.quantity })),
        );

        await this.prisma.salonBooking.update({ where: { id: bookingId }, data: { totalAmount: total } });
        return this.findOne(bookingId);
    }

    private assertModifiable(status: SalonBookingStatus) {
        if (status !== SalonBookingStatus.SCHEDULED && status !== SalonBookingStatus.IN_PROGRESS) {
            throw new BadRequestException(`Cannot modify a booking that is already ${status}`);
        }
    }

    /**
     * Cancel is intentionally stricter than the general "modifiable" check —
     * once a booking is In Progress, the Stylist has already started serving
     * the customer, so cancelling it no longer makes sense. This was
     * previously missing: assertModifiable() alone let an In Progress
     * booking be cancelled, which the current spec explicitly says
     * shouldn't be possible.
     */
    private assertCancellable(status: SalonBookingStatus) {
        if (status !== SalonBookingStatus.SCHEDULED) {
            throw new BadRequestException(
                status === SalonBookingStatus.IN_PROGRESS
                    ? 'Cannot cancel a booking that is already In Progress — the Stylist has already started this service'
                    : `Cannot cancel a booking that is already ${status}`,
            );
        }
    }

    async start(id: string) {
        const booking = await this.findOne(id);
        this.assertModifiable(booking.status as SalonBookingStatus);
        const updated = await this.prisma.salonBooking.update({ where: { id }, data: { status: SalonBookingStatus.IN_PROGRESS } });
        return withBookingCode(updated);
    }

    /**
     * The single trigger point for both inventory deduction and commission
     * calculation — mirrors the SRS's "Completed is the one event both react
     * to" rule for the marketplace Booking model.
     */
    async complete(id: string, actorId: string | undefined) {
        const booking = await this.prisma.salonBooking.findUnique({
            where: { id },
            include: { inventoryItems: { include: { item: true } }, services: true, assignedStaff: true },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        this.assertModifiable(booking.status as SalonBookingStatus);
        if (!booking.assignedStaffId || !booking.assignedStaff) {
            throw new BadRequestException('Cannot complete a booking with no Stylist assigned — verify the reservation or assign one first');
        }

        // Re-validate stock availability at completion time, not just when items were added.
        for (const line of booking.inventoryItems) {
            if (line.item.currentQuantity < line.quantity) {
                throw new BadRequestException(
                    `Insufficient stock for "${line.item.name}" — ${line.item.currentQuantity} available, ${line.quantity} needed`,
                );
            }
        }

        const now = new Date();

        await this.prisma.$transaction(async (tx) => {
            for (const line of booking.inventoryItems) {
                await tx.inventoryItem.update({
                    where: { id: line.itemId },
                    data: { currentQuantity: { decrement: line.quantity } },
                });
                await tx.stockMovement.create({
                    data: {
                        itemId: line.itemId,
                        type: line.item.category === 'FOR_SALE' ? StockMovementType.SOLD : StockMovementType.CONSUMED,
                        quantityDelta: -line.quantity,
                        referenceId: booking.id,
                        performedById: actorId,
                    },
                });
            }

            const rate = booking.assignedStaff?.commissionRate ? Number(booking.assignedStaff.commissionRate) : 0;
            const serviceTotal = booking.services.reduce((sum, s) => sum + Number(s.price) * s.quantity, 0);
            const commissionAmount = Math.round(serviceTotal * rate * 100) / 100;

            await tx.salonBookingCommission.create({
                data: {
                    bookingId: booking.id,
                    staffId: booking.assignedStaffId!,
                    amount: commissionAmount,
                    rateApplied: rate,
                },
            });

            await tx.salonBooking.update({
                where: { id },
                data: { status: SalonBookingStatus.COMPLETED, completedAt: now },
            });
        });

        for (const line of booking.inventoryItems) {
            await this.inventoryService.checkAndTriggerLowStockAlert(line.itemId);
        }

        return this.findOne(id);
    }

    async cancel(id: string, dto: CancelSalonBookingDto) {
        const booking = await this.findOne(id);
        this.assertCancellable(booking.status as SalonBookingStatus);

        const updated = await this.prisma.salonBooking.update({
            where: { id },
            data: { status: SalonBookingStatus.CANCELLED, cancelReason: dto.reason, cancelledAt: new Date() },
        });
        return withBookingCode(updated);
    }

    async markNoShow(id: string, dto: CancelSalonBookingDto) {
        const booking = await this.findOne(id);
        this.assertModifiable(booking.status as SalonBookingStatus);

        const updated = await this.prisma.salonBooking.update({
            where: { id },
            data: { status: SalonBookingStatus.NO_SHOW, cancelReason: dto.reason, cancelledAt: new Date() },
        });
        return withBookingCode(updated);
    }

    /**
     * Full edit — Scheduled/In Progress bookings only. Every field is
     * optional; only what's actually sent gets validated and changed.
     * Re-runs the same past-date and business-hours-closure checks
     * create() enforces whenever date/time actually changes — an edit can
     * move a booking into an invalid state just as easily as a fresh
     * create can, so it needs the same guardrails, not looser ones just
     * because the booking already exists.
     *
     * customerId (the linked Customer record, if any) is deliberately left
     * untouched here even if customerName/customerPhone change — silently
     * re-linking to a different Customer record on a name/phone edit could
     * move this booking's history to someone else's profile unexpectedly.
     * Only the denormalized text fields on the booking itself are updated.
     */
    async editBooking(id: string, dto: EditSalonBookingDto) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');
        this.assertModifiable(booking.status as SalonBookingStatus);

        const newDate = dto.bookingDate ?? booking.bookingDate.toISOString().slice(0, 10);
        const newTime = dto.bookingTime ?? booking.bookingTime;

        if (dto.bookingDate || dto.bookingTime) {
            if (watDateTimeFromParts(newDate, newTime).getTime() < Date.now()) {
                throw new BadRequestException('Booking date/time cannot be in the past');
            }
            const exception = await resolveBusinessException(this.prisma, booking.branchId, newDate);
            if (exception?.isClosed) {
                throw new BadRequestException(
                    `This branch is closed on ${newDate}${exception.reason ? ` (${exception.reason})` : ''} — bookings cannot be made for this date.`,
                );
            }
            if (exception && !exception.isClosed && exception.openTime && exception.closeTime) {
                if (newTime < exception.openTime || newTime > exception.closeTime) {
                    throw new BadRequestException(
                        `On ${newDate}, this branch's hours are ${exception.openTime}\u2013${exception.closeTime}${exception.reason ? ` (${exception.reason})` : ''} — the requested time falls outside that window.`,
                    );
                }
            }
        }

        if (dto.assignedStaffId) {
            const staff = await this.prisma.staff.findUnique({ where: { id: dto.assignedStaffId } });
            if (!staff) throw new NotFoundException('Assigned staff member not found');
            if (staff.locationId !== booking.branchId) {
                throw new BadRequestException('The assigned staff member is not based at this branch');
            }
        }

        if (dto.services) {
            const serviceIds = dto.services.map((s) => s.serviceId);
            const services = await this.prisma.service.findMany({ where: { id: { in: serviceIds } } });
            if (services.length !== new Set(serviceIds).size) {
                throw new BadRequestException('One or more services were not found');
            }
            const servicePrices = await this.resolveServicePrices(booking.branchId, serviceIds);
            const serviceLines = dto.services.map((line) => {
                const service = services.find((s) => s.id === line.serviceId)!;
                return { serviceId: service.id, price: servicePrices.get(service.id) ?? Number(service.walkInPrice), quantity: line.quantity ?? 1, bookingId: id };
            });

            // Replaces the whole service-line set — an edit's "services"
            // field represents the booking's complete new service list,
            // not an incremental add. Existing inventory lines are
            // untouched; editBooking() only ever changes service lines.
            await this.prisma.$transaction([
                this.prisma.salonBookingService.deleteMany({ where: { bookingId: id } }),
                this.prisma.salonBookingService.createMany({ data: serviceLines }),
            ]);
        }

        await this.prisma.salonBooking.update({
            where: { id },
            data: {
                ...(dto.customerName !== undefined && { customerName: dto.customerName }),
                ...(dto.customerPhone !== undefined && { customerPhone: dto.customerPhone }),
                ...(dto.assignedStaffId !== undefined && { assignedStaffId: dto.assignedStaffId }),
                ...(dto.bookingDate !== undefined && { bookingDate: new Date(dto.bookingDate) }),
                ...(dto.bookingTime !== undefined && { bookingTime: dto.bookingTime }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
            },
        });

        // Recomputes totalAmount from whatever service/inventory lines now
        // exist, whether or not this particular edit touched services —
        // cheap, and guarantees totalAmount can never drift from its lines.
        return this.recomputeTotal(id);
    }

    /**
     * Completed bookings only — the ONE way a Completed booking can still
     * change: adding a new service line. Existing service lines are
     * completely untouched here (no delete, no price/quantity edit) — that
     * immutability is enforced in this method, not just implied by the
     * DTO's shape.
     */
    async addServiceToCompletedBooking(id: string, dto: AddServiceToCompletedBookingDto) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id } });
        if (!booking) throw new NotFoundException('Booking not found');
        if (booking.status !== SalonBookingStatus.COMPLETED) {
            throw new BadRequestException('This endpoint only applies to Completed bookings — use the regular edit for Scheduled/In Progress bookings');
        }

        const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
        if (!service) throw new NotFoundException('Service not found');

        const priceMap = await this.resolveServicePrices(booking.branchId, [dto.serviceId]);
        const price = priceMap.get(dto.serviceId) ?? Number(service.walkInPrice);
        const quantity = dto.quantity ?? 1;

        await this.prisma.salonBookingService.create({
            data: { bookingId: id, serviceId: dto.serviceId, price, quantity },
        });

        return this.recomputeTotal(id);
    }
}