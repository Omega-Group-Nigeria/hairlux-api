import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SetStaffWorkCalendarDto } from './dto/set-staff-work-calendar.dto';
import { watDayOfWeek } from '../common/utils/wat-time.util';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// A fixed, arbitrary Monday used purely as a stable reference point for
// "every other week" patterns (e.g. alternate Saturdays) — not tied to ISO
// week numbers, which have year-boundary edge cases that don't matter here.
// Any fixed epoch works as long as it never changes once staff calendars
// start being configured against it.
const BIWEEKLY_EPOCH = new Date('2024-01-01T00:00:00+01:00');

export interface EffectiveWorkDay {
    dayOfWeek: number;
    dayType: 'WORKING' | 'OFF' | 'HALF_DAY';
    resumeTime: string | null;
    closingTime: string | null;
    source: 'staff_calendar' | 'staff_calendar_alternate' | 'business_hours_default';
}

@Injectable()
export class StaffWorkCalendarService {
    constructor(private prisma: PrismaService) { }

    /** ISO-week-independent "which side of the alternation" a given WAT calendar date falls on. */
    private weekParityFor(dateStr: string): number {
        const weeksSinceEpoch = Math.floor(
            (new Date(`${dateStr}T00:00:00+01:00`).getTime() - BIWEEKLY_EPOCH.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        return ((weeksSinceEpoch % 2) + 2) % 2; // guard against negative mod for dates before the epoch
    }

    async getCalendar(staffId: string) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const [rows, businessHours] = await Promise.all([
            this.prisma.staffWorkCalendar.findMany({ where: { staffId }, orderBy: { dayOfWeek: 'asc' } }),
            this.prisma.businessHours.findMany({ orderBy: { dayOfWeek: 'asc' } }),
        ]);

        const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
        const businessByDay = new Map(businessHours.map((b) => [b.dayOfWeek, b]));

        const days = Array.from({ length: 7 }, (_, dayOfWeek) => {
            const row = byDay.get(dayOfWeek);
            const label = DAY_NAMES[dayOfWeek];

            if (row) {
                return {
                    dayOfWeek,
                    label,
                    configured: true,
                    dayType: row.dayType,
                    resumeTime: row.resumeTime,
                    closingTime: row.closingTime,
                    alternatesBiweekly: row.alternatesBiweekly,
                    activeWeekParity: row.activeWeekParity,
                    alternateDayType: row.alternateDayType,
                };
            }

            // Not explicitly configured -- default to the company's own
            // BusinessHours for that day, so a new staff member behaves sensibly
            // before anyone has set up their individual calendar yet.
            const fallback = businessByDay.get(dayOfWeek);
            return {
                dayOfWeek,
                label,
                configured: false,
                dayType: (fallback?.isOpen ?? true) ? 'WORKING' as const : 'OFF' as const,
                resumeTime: fallback?.openTime ?? null,
                closingTime: fallback?.closeTime ?? null,
                alternatesBiweekly: false,
                activeWeekParity: null,
                alternateDayType: null,
            };
        });

        return { staffId, days };
    }

    async setCalendar(staffId: string, dto: SetStaffWorkCalendarDto) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
        if (!staff) throw new NotFoundException('Staff record not found');

        for (const day of dto.days) {
            if (day.dayType !== 'OFF' && (!day.resumeTime || !day.closingTime)) {
                throw new BadRequestException(
                    `Day ${DAY_NAMES[day.dayOfWeek]}: resumeTime and closingTime are required when dayType is ${day.dayType}`,
                );
            }
            if (day.alternatesBiweekly && (day.activeWeekParity === undefined || !day.alternateDayType)) {
                throw new BadRequestException(
                    `Day ${DAY_NAMES[day.dayOfWeek]}: activeWeekParity and alternateDayType are required when alternatesBiweekly is true`,
                );
            }
        }

        await this.prisma.$transaction(
            dto.days.map((day) =>
                this.prisma.staffWorkCalendar.upsert({
                    where: { staffId_dayOfWeek: { staffId, dayOfWeek: day.dayOfWeek } },
                    create: {
                        staffId,
                        dayOfWeek: day.dayOfWeek,
                        dayType: day.dayType,
                        resumeTime: day.dayType === 'OFF' ? null : day.resumeTime,
                        closingTime: day.dayType === 'OFF' ? null : day.closingTime,
                        alternatesBiweekly: day.alternatesBiweekly ?? false,
                        activeWeekParity: day.alternatesBiweekly ? day.activeWeekParity : null,
                        alternateDayType: day.alternatesBiweekly ? day.alternateDayType : null,
                    },
                    update: {
                        dayType: day.dayType,
                        resumeTime: day.dayType === 'OFF' ? null : day.resumeTime,
                        closingTime: day.dayType === 'OFF' ? null : day.closingTime,
                        alternatesBiweekly: day.alternatesBiweekly ?? false,
                        activeWeekParity: day.alternatesBiweekly ? day.activeWeekParity : null,
                        alternateDayType: day.alternatesBiweekly ? day.alternateDayType : null,
                    },
                }),
            ),
        );

        return this.getCalendar(staffId);
    }

    /**
     * Seeds a staff member's calendar from the company's current
     * BusinessHours — a convenience action so admin doesn't have to
     * configure every staff member's week entirely from scratch. Anything
     * already explicitly configured for that staff member is left untouched
     * unless overwrite is true.
     */
    async applyBusinessHoursDefault(staffId: string, overwrite = false) {
        const staff = await this.prisma.staff.findUnique({ where: { id: staffId }, select: { id: true } });
        if (!staff) throw new NotFoundException('Staff record not found');

        const [businessHours, existing] = await Promise.all([
            this.prisma.businessHours.findMany(),
            this.prisma.staffWorkCalendar.findMany({ where: { staffId }, select: { dayOfWeek: true } }),
        ]);
        const existingDays = new Set(existing.map((e) => e.dayOfWeek));

        const toApply = businessHours.filter((b) => overwrite || !existingDays.has(b.dayOfWeek));
        if (toApply.length === 0) return this.getCalendar(staffId);

        await this.prisma.$transaction(
            toApply.map((b) =>
                this.prisma.staffWorkCalendar.upsert({
                    where: { staffId_dayOfWeek: { staffId, dayOfWeek: b.dayOfWeek } },
                    create: {
                        staffId,
                        dayOfWeek: b.dayOfWeek,
                        dayType: b.isOpen ? 'WORKING' : 'OFF',
                        resumeTime: b.isOpen ? b.openTime : null,
                        closingTime: b.isOpen ? b.closeTime : null,
                    },
                    update: {
                        dayType: b.isOpen ? 'WORKING' : 'OFF',
                        resumeTime: b.isOpen ? b.openTime : null,
                        closingTime: b.isOpen ? b.closeTime : null,
                    },
                }),
            ),
        );

        return this.getCalendar(staffId);
    }

    /**
     * The effective work-day configuration for a specific staff member on a
     * specific WAT calendar date — resolving alternate-week patterns and
     * falling back to BusinessHours where nothing is explicitly configured.
     * This is what Phase 2 (wiring this into the actual clock-in/out
     * decision) will call; not yet used by the live attendance flow.
     */
    async resolveEffectiveDay(staffId: string, dateStr: string): Promise<EffectiveWorkDay> {
        const dayOfWeek = watDayOfWeek(new Date(`${dateStr}T12:00:00+01:00`));

        const row = await this.prisma.staffWorkCalendar.findUnique({
            where: { staffId_dayOfWeek: { staffId, dayOfWeek } },
        });

        if (!row) {
            const fallback = await this.prisma.businessHours.findUnique({ where: { dayOfWeek } });
            return {
                dayOfWeek,
                dayType: (fallback?.isOpen ?? true) ? 'WORKING' : 'OFF',
                resumeTime: fallback?.openTime ?? null,
                closingTime: fallback?.closeTime ?? null,
                source: 'business_hours_default',
            };
        }

        if (row.alternatesBiweekly && row.activeWeekParity !== null && row.alternateDayType) {
            const parity = this.weekParityFor(dateStr);
            if (parity !== row.activeWeekParity) {
                return {
                    dayOfWeek,
                    dayType: row.alternateDayType,
                    resumeTime: null,
                    closingTime: null,
                    source: 'staff_calendar_alternate',
                };
            }
        }

        return {
            dayOfWeek,
            dayType: row.dayType,
            resumeTime: row.resumeTime,
            closingTime: row.closingTime,
            source: 'staff_calendar',
        };
    }
}