import { db } from "@/db";
import { officeConfig } from "@/db/schema";
import { desc } from "drizzle-orm";

export interface OfficeConfigRow {
  id: string;
  office_start: string;
  office_end: string;
  checkin_window_minutes: number;
  checkout_window_minutes: number;
  break_start_time: string;
  break_end_time: string;
  break_start_time_friday?: string;
  break_end_time_friday?: string;
  break_minutes_default: number;
  break_minutes_friday: number;
  break_tracking_enabled: boolean;
  break_grace_minutes: number;
  beneficiary_minutes_default: number;
}

export const CONFIG_DEFAULTS: Omit<OfficeConfigRow, "id"> = {
  office_start: "09:00",
  office_end: "18:00",
  checkin_window_minutes: 60,
  checkout_window_minutes: 60,
  break_start_time: "14:00",
  break_end_time: "14:30",
  break_start_time_friday: undefined,
  break_end_time_friday: undefined,
  break_minutes_default: 30,
  break_minutes_friday: 60,
  break_tracking_enabled: true,
  break_grace_minutes: 5,
  beneficiary_minutes_default: 0,
};

export async function getOfficeConfig(): Promise<OfficeConfigRow> {
  try {
    const row = await db
      .select()
      .from(officeConfig)
      .orderBy(desc(officeConfig.created_at))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!row) return { id: "default", ...CONFIG_DEFAULTS };

    return {
      id: row.id,
      office_start: row.office_start,
      office_end: row.office_end,
      checkin_window_minutes: row.checkin_window_minutes,
      checkout_window_minutes: row.checkout_window_minutes,
      break_start_time: row.break_start_time,
      break_end_time: row.break_end_time,
      break_start_time_friday: row.break_start_time_friday ?? undefined,
      break_end_time_friday: row.break_end_time_friday ?? undefined,
      break_minutes_default: row.break_minutes_default,
      break_minutes_friday: row.break_minutes_friday,
      break_tracking_enabled: row.break_tracking_enabled,
      break_grace_minutes: row.break_grace_minutes,
      beneficiary_minutes_default: row.beneficiary_minutes_default ?? 0,
    };
  } catch {
    return { id: "default", ...CONFIG_DEFAULTS };
  }
}

export function getAllowedBreakMinutes(
  config: Omit<OfficeConfigRow, "id">,
  date: Date,
): number {
  // Use PKT day-of-week for Friday check
  const pktMirror = new Date(date.getTime() + PKT_OFFSET_MS);
  return pktMirror.getUTCDay() === 5
    ? config.break_minutes_friday
    : config.break_minutes_default;
}

// ─────────────────────────────────────────────────────────────────────────────
// PKT Timezone Helpers
//
// Vercel servers run in UTC. All "HH:mm" times in office config are PKT
// (UTC+5). Using setHours() on a UTC server sets UTC time, not PKT — so
// "14:00" break start becomes 14:00 UTC = 19:00 PKT, firing 5h too late.
//
// These helpers build times as UTC offsets from PKT midnight, so they work
// correctly on any server timezone including Vercel UTC.
// ─────────────────────────────────────────────────────────────────────────────

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

/**
 * Returns a Date whose .getUTC*() methods return PKT values.
 * Use for day-of-week and date comparisons in PKT.
 */
function toPKTMirror(utcDate: Date): Date {
  return new Date(utcDate.getTime() + PKT_OFFSET_MS);
}

/**
 * Interprets hhmm as a PKT clock time on the same PKT calendar day as
 * utcRef. Returns a true UTC Date. Works on Vercel (UTC servers).
 *
 * Example:
 *   parseTimeOnDayPKT("14:00", 2026-05-18T09:00:00Z)
 *   PKT day = May 18 → 14:00 PKT = 09:00 UTC → returns 2026-05-18T09:00:00Z ✓
 */
export function parseTimeOnDayPKT(hhmm: string, utcRef: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const pktMirror = toPKTMirror(utcRef);
  const pktMidnightUTC =
    Date.UTC(
      pktMirror.getUTCFullYear(),
      pktMirror.getUTCMonth(),
      pktMirror.getUTCDate(),
    ) - PKT_OFFSET_MS;
  return new Date(pktMidnightUTC + (h * 60 + m) * 60 * 1000);
}

/**
 * Returns the break window {start, end} for a given UTC date,
 * using PKT day-of-week for the Friday check.
 * Replaces getBreakWindowForDate everywhere that runs on Vercel.
 */
export function getBreakWindowForDatePKT(
  config: Omit<OfficeConfigRow, "id">,
  utcDate: Date,
): { start: string; end: string } {
  const pktMirror = toPKTMirror(utcDate);
  const isFriday = pktMirror.getUTCDay() === 5;
  if (
    isFriday &&
    config.break_start_time_friday &&
    config.break_end_time_friday
  ) {
    return {
      start: config.break_start_time_friday,
      end: config.break_end_time_friday,
    };
  }
  return { start: config.break_start_time, end: config.break_end_time };
}

/**
 * Original naive version — uses server local time via setHours().
 * ONLY safe when the server timezone matches PKT (e.g. local dev).
 * Do NOT use in production routes; use parseTimeOnDayPKT instead.
 * Kept for backward compatibility with any non-server callers.
 */
export function parseTimeOnDay(hhmm: string, base: Date): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Original naive version — uses server local day-of-week.
 * Do NOT use in production routes; use getBreakWindowForDatePKT instead.
 * Kept for backward compatibility.
 */
export function getBreakWindowForDate(
  config: Omit<OfficeConfigRow, "id">,
  date: Date,
): { start: string; end: string } {
  const isFriday = date.getDay() === 5;
  if (
    isFriday &&
    config.break_start_time_friday &&
    config.break_end_time_friday
  ) {
    return {
      start: config.break_start_time_friday,
      end: config.break_end_time_friday,
    };
  }
  return { start: config.break_start_time, end: config.break_end_time };
}

/**
 * Derives break_minutes from the break_start_time / break_end_time strings.
 */
export function derivedBreakMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

// ─────────────────────────────────────────────────────────────────────────────
// Working days calculator
//
// Rules:
//   • Sunday     → always off
//   • Last Saturday of the month → off
//   • All other days (Mon–Sat)   → working
// ─────────────────────────────────────────────────────────────────────────────
export interface WorkingDaysBreakdown {
  workingDays: number;
  totalMonSat: number;
  lastSaturdayDate: number;
  sundays: number;
}

export function calculateWorkingDays(
  year: number,
  month: number,
): WorkingDaysBreakdown {
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let lastSaturdayDate = -1;
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, month, d).getDay() === 6) {
      lastSaturdayDate = d;
      break;
    }
  }

  let workingDays = 0;
  let totalMonSat = 0;
  let sundays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month, d).getDay();

    if (dow === 0) {
      sundays++;
      continue;
    }

    totalMonSat++;

    if (dow === 6 && d === lastSaturdayDate) {
      continue;
    }

    workingDays++;
  }

  return { workingDays, totalMonSat, lastSaturdayDate, sundays };
}

export function workingDaysForMonthString(
  monthStr: string,
): WorkingDaysBreakdown {
  const [year, month] = monthStr.split("-").map(Number);
  return calculateWorkingDays(year, month - 1);
}
