import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SalonBookingStatus, StockMovementType } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddSalonBookingInventoryItemDto } from './dto/add-inventory-item.dto';
import { CancelSalonBookingDto } from './dto/cancel-salon-booking.dto';
import { CreateSalonBookingDto } from './dto/create-salon-booking.dto';
import { QuerySalonBookingsDto } from './dto/query-salon-bookings.dto';

const INCLUDE_FULL = {
    branch: { select: { id: true, name: true } },
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

    async create(dto: CreateSalonBookingDto, createdById: string) {
        if (!dto.branchId) {
            throw new BadRequestException('branchId is required');
        }

        const staff = await this.prisma.staff.findUnique({ where: { id: dto.assignedStaffId } });
        if (!staff) throw new NotFoundException('Assigned staff member not found');
        if (staff.locationId !== dto.branchId) {
            throw new BadRequestException('The assigned staff member is not based at this branch');
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

        const serviceLines = dto.services.map((line) => {
            const service = services.find((s) => s.id === line.serviceId)!;
            return { serviceId: service.id, price: Number(service.walkInPrice), quantity: line.quantity ?? 1 };
        });

        const totalAmount = this.computeTotal(serviceLines, inventoryLines);

        const booking = await this.prisma.salonBooking.create({
            data: {
                branchId: dto.branchId,
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
    async complete(id: string, actorId: string) {
        const booking = await this.prisma.salonBooking.findUnique({
            where: { id },
            include: { inventoryItems: { include: { item: true } }, services: true, assignedStaff: true },
        });
        if (!booking) throw new NotFoundException('Booking not found');
        this.assertModifiable(booking.status as SalonBookingStatus);

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

            const rate = booking.assignedStaff.commissionRate ? Number(booking.assignedStaff.commissionRate) : 0;
            const serviceTotal = booking.services.reduce((sum, s) => sum + Number(s.price) * s.quantity, 0);
            const commissionAmount = Math.round(serviceTotal * rate * 100) / 100;

            await tx.salonBookingCommission.create({
                data: {
                    bookingId: booking.id,
                    staffId: booking.assignedStaffId,
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