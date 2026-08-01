import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryLogEntryDto } from './dto/create-inventory-log-entry.dto';


type InventoryTotal = {
  locationId: string;
  locationName: string;
  productName: string;
  total: number;
};

type InventoryEntryWithLocation = {
  locationId: string;
  location: { name: string; code: string };
  productName: string;
  type: 'RECEIVED' | 'SOLD';
  quantity: number;
};

@Injectable()
export class StaffOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private get attendanceModel() {
    return (this.prisma as unknown as { attendanceRecord: any }).attendanceRecord;
  }
  private get inventoryModel() {
    return (this.prisma as unknown as { inventoryLogEntry: any }).inventoryLogEntry;
  }
  private get staffModel() {
    return (this.prisma as unknown as { staff: any }).staff;
  }

  /**
   * Server-side "today" at UTC midnight. Known prototype limitation: for
   * staff working right around midnight local time, this can attribute a
   * check-in to the "wrong" calendar day relative to Nigeria's UTC+1 --
   * acceptable for a Phase 3 prototype per the brief, worth revisiting
   * with proper timezone handling in the Month 2 production build.
   */
  private todayDateOnly(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private async getStaffOrThrow(staffId: string) {
    const staff = await this.staffModel.findFirst({ where: { id: staffId } });
    if (!staff) {
      throw new NotFoundException('Staff record not found');
    }
    return staff;
  }

  // -- Attendance ---------------------------------------------------------

  async checkIn(staffId: string) {
    const staff = await this.getStaffOrThrow(staffId);
    const today = this.todayDateOnly();

    const existing = await this.attendanceModel.findFirst({
      where: { staffId, date: today },
    });
    if (existing) {
      throw new ConflictException(
        existing.checkOutAt
          ? 'You have already checked in and out today'
          : 'You are already checked in today',
      );
    }

    return this.attendanceModel.create({
      data: {
        staffId,
        locationId: staff.locationId,
        date: today,
        checkInAt: new Date(),
      },
    });
  }

  async checkOut(staffId: string) {
    const today = this.todayDateOnly();
    const record = await this.attendanceModel.findFirst({
      where: { staffId, date: today },
    });

    if (!record) {
      throw new BadRequestException('You have not checked in today');
    }
    if (record.checkOutAt) {
      throw new ConflictException('You have already checked out today');
    }

    return this.attendanceModel.update({
      where: { id: record.id },
      data: { checkOutAt: new Date() },
    });
  }

  async getMyAttendance(staffId: string) {
    return this.attendanceModel.findMany({
      where: { staffId },
      orderBy: { date: 'desc' },
      take: 60,
    });
  }

  /** Admin report: who checked in/out, when, at which branch. */
  async getAttendanceReport(filters: { date?: string; locationId?: string; staffId?: string }) {
    return this.attendanceModel.findMany({
      where: {
        ...(filters.date && { date: new Date(filters.date) }),
        ...(filters.locationId && { locationId: filters.locationId }),
        ...(filters.staffId && { staffId: filters.staffId }),
      },
      include: {
        staff: { select: { name: true, staffCode: true } },
        location: { select: { name: true, code: true } },
      },
      orderBy: { date: 'desc' },
      take: 500,
    });
  }

  // -- Inventory ------------------------------------------------------------

  /**
   * Uses the staff member's OWN locationId, never a client-supplied one --
   * a staff member can only log inventory for the branch they're actually
   * assigned to.
   */
  async logInventoryEntry(staffId: string, dto: CreateInventoryLogEntryDto) {
    const staff = await this.getStaffOrThrow(staffId);

    return this.inventoryModel.create({
      data: {
        staffId,
        locationId: staff.locationId,
        productName: dto.productName,
        type: dto.type,
        quantity: dto.quantity,
        note: dto.note ?? null,
      },
    });
  }

  /** Staff-self version -- always scoped to the caller's own branch, never client-supplied. */
  async getMyInventoryDashboard(staffId: string) {
    const staff = await this.getStaffOrThrow(staffId);
    return this.getInventoryDashboard(staff.locationId);
  }

  /** Staff-self version -- always scoped to the caller's own branch. */
  async getMyInventoryEntries(staffId: string) {
    const staff = await this.getStaffOrThrow(staffId);
    return this.getInventoryEntries({ locationId: staff.locationId });
  }

  async getInventoryDashboard(locationId?: string) {
    const entries = await this.inventoryModel.findMany({
      where: locationId ? { locationId } : undefined,
      include: { location: { select: { name: true, code: true } } },
    });

    const totals = new Map<string, InventoryTotal>();

    for (const e of entries as InventoryEntryWithLocation[]) {
      const key = `${e.locationId}::${e.productName}`;
      const existing = totals.get(key) ?? {
        locationId: e.locationId,
        locationName: e.location.name,
        productName: e.productName,
        total: 0,
      };
      existing.total += e.type === 'RECEIVED' ? e.quantity : -e.quantity;
      totals.set(key, existing);
    }

    return Array.from(totals.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }

  async getInventoryEntries(filters: { locationId?: string; productName?: string }) {
    return this.inventoryModel.findMany({
      where: {
        ...(filters.locationId && { locationId: filters.locationId }),
        ...(filters.productName && {
          productName: { contains: filters.productName, mode: 'insensitive' },
        }),
      },
      include: {
        staff: { select: { name: true, staffCode: true } },
        location: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }
}