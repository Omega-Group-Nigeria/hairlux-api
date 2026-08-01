import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SalonBookingStatus, StockMovementType } from '@prisma/client';
import { randomInt } from 'crypto';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddSalonBookingInventoryItemDto } from './dto/add-inventory-item.dto';
import { CancelSalonBookingDto } from './dto/cancel-salon-booking.dto';
import { CreateSalonBookingDto } from './dto/create-salon-booking.dto';
import { QuerySalonBookingsDto } from './dto/query-salon-bookings.dto';
import { ReserveSalonBookingDto } from './dto/reserve-salon-booking.dto';
import { VerifyReservationDto } from './dto/verify-reservation.dto';

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
    ) { }

    async create(dto: CreateSalonBookingDto, createdById: string | undefined) {
        if (!dto.branchId) {
            throw new BadRequestException('branchId is required');
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
            ? (await this.findOrCreateCustomer(dto.customerName, dto.customerPhone, dto.customerEmail)).id
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

        return booking;
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

    private async findOrCreateCustomer(name: string, phone: string, email?: string) {
        const existing = await this.prisma.customer.findUnique({ where: { phone } });
        if (existing) return existing;
        return this.prisma.customer.create({ data: { name, phone, email } });
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

        return this.prisma.salonBooking.create({
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
        return booking;
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
        const { branchId, assignedStaffId, status, date, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(branchId && { branchId }),
            ...(assignedStaffId && { assignedStaffId }),
            ...(status && { status }),
            ...(date && { bookingDate: new Date(date) }),
        };

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

        return { data: bookings, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    async findOne(id: string) {
        const booking = await this.prisma.salonBooking.findUnique({ where: { id }, include: INCLUDE_FULL });
        if (!booking) throw new NotFoundException('Booking not found');
        return booking;
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

    async start(id: string) {
        const booking = await this.findOne(id);
        this.assertModifiable(booking.status as SalonBookingStatus);
        return this.prisma.salonBooking.update({ where: { id }, data: { status: SalonBookingStatus.IN_PROGRESS } });
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
        this.assertModifiable(booking.status as SalonBookingStatus);

        return this.prisma.salonBooking.update({
            where: { id },
            data: { status: SalonBookingStatus.CANCELLED, cancelReason: dto.reason, cancelledAt: new Date() },
        });
    }

    async markNoShow(id: string, dto: CancelSalonBookingDto) {
        const booking = await this.findOne(id);
        this.assertModifiable(booking.status as SalonBookingStatus);

        return this.prisma.salonBooking.update({
            where: { id },
            data: { status: SalonBookingStatus.NO_SHOW, cancelReason: dto.reason, cancelledAt: new Date() },
        });
    }
}