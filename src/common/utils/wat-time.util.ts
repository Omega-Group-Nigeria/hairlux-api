/**
 * Nigeria (WAT) is a fixed UTC+1 offset year-round — no daylight saving —
 * so a constant offset is enough here without needing a full timezone
 * database. Centralized here (rather than duplicated per-service, as it
 * was across attendance, salon-booking, and branch-finance before this)
 * because every one of Date's local-timezone-dependent methods (getDay,
 * setHours, the plain Date constructor's local parsing) silently uses the
 * SERVER's zone, not WAT — the exact bug this replaces, in every place it
 * could otherwise resurface.
 */
export const WAT_OFFSET_MS = 60 * 60 * 1000;

/** 'YYYY-MM-DD' for "today" (or any given instant) as a calendar date in WAT, not the server's own zone. */
export function watTodayDateStr(now: Date): string {
    return new Date(now.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 (Sunday) .. 6 (Saturday), for a given instant's day-of-week in WAT. */
export function watDayOfWeek(now: Date): number {
    return new Date(now.getTime() + WAT_OFFSET_MS).getUTCDay();
}

/** Builds a Date for a specific WAT calendar date ('YYYY-MM-DD') + "HH:MM" WAT clock time. */
export function watDateAtTime(dateStr: string, hhmm: string): Date {
    const [hour, minute] = hhmm.split(':').map(Number);
    return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+01:00`);
}