// app/api/attendance/auto-checkout/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users, breakSessions } from "@/db/schema";
import { and, eq, isNull, isNotNull, sql } from "drizzle-orm";
import { getOfficeConfig, parseTimeOnDayPKT } from "@/lib/office-config";
import { recalculateUserPayroll } from "@/lib/payroll-calculator";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function getTodayPKTStr(utcNow: Date): string {
  const pkt = new Date(utcNow.getTime() + PKT_OFFSET_MS);
  return [
    pkt.getUTCFullYear(),
    String(pkt.getUTCMonth() + 1).padStart(2, "0"),
    String(pkt.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

// ── Auth check ────────────────────────────────────────────────────────────────
function isCronRequest(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

async function isAdminSession(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return (
    session?.user.role === "ADMIN" ||
    session?.user.role === "ATTENDANCE_MANAGER"
  );
}

// ── Shared record query ───────────────────────────────────────────────────────
async function getOpenRecords(todayPKTStr: string) {
  return db
    .select({
      id: attendance.id,
      user_id: attendance.user_id,
      check_in: attendance.check_in,
      date: attendance.date,
      notes: attendance.notes,
      userName: users.name,
      userRole: users.role,
    })
    .from(attendance)
    .leftJoin(users, eq(attendance.user_id, users.id))
    .where(
      and(
        isNull(attendance.check_out),
        sql`${attendance.date} < ${todayPKTStr}`,
      ),
    );
}

// ── PKT-aware day-of-week (same as attendance/route.ts) ──────────────────────
function getPKTDayOfWeek(dateStr: string): number {
  const date = new Date(`${dateStr}T12:00:00+05:00`);
  return date.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
}

// ── Get allowed break minutes for a date ─────────────────────────────────────
function getAllowedBreakForDate(
  dateStr: string,
  config: { break_minutes_default: number; break_minutes_friday: number },
): number {
  const dow = getPKTDayOfWeek(dateStr);
  return dow === 5 ? config.break_minutes_friday : config.break_minutes_default;
}

// ── Fetch actual break minutes taken for an attendance record ─────────────────
async function getActualBreakMinutes(attendanceId: string): Promise<number> {
  const breaks = await db
    .select({ actual_minutes: breakSessions.actual_minutes })
    .from(breakSessions)
    .where(
      and(
        eq(breakSessions.attendance_id, attendanceId),
        isNotNull(breakSessions.break_end),
      ),
    );

  return breaks.reduce(
    (sum, b) => sum + (parseFloat(String(b.actual_minutes ?? 0)) || 0),
    0,
  );
}

// ── Shared computation ────────────────────────────────────────────────────────
function computeCheckout(
  checkInDate: Date,
  officeEnd: string,
  now: Date,
  breakMinutesToDeduct: number,
): {
  officeEndUTC: Date;
  totalHours: number;
  status: "PRESENT" | "HALF_DAY";
  skip: string | null;
} {
  const officeEndUTC = parseTimeOnDayPKT(officeEnd, checkInDate);

  if (officeEndUTC <= checkInDate) {
    return {
      officeEndUTC,
      totalHours: 0,
      status: "PRESENT",
      skip: "Check-in was after office end",
    };
  }

  if (officeEndUTC > now) {
    return {
      officeEndUTC,
      totalHours: 0,
      status: "PRESENT",
      skip: "Shift not yet complete",
    };
  }

  const grossMs = officeEndUTC.getTime() - checkInDate.getTime();
  const grossMinutes = Math.max(0, grossMs / (1000 * 60));

  // Deduct actual break taken (capped at allowed — overtime is handled by payroll)
  const netMinutes = Math.max(0, grossMinutes - breakMinutesToDeduct);
  const totalHours = parseFloat((netMinutes / 60).toFixed(2));
  const status = totalHours < 4 ? "HALF_DAY" : "PRESENT";

  return { officeEndUTC, totalHours, status, skip: null };
}

// ── Core execution logic ──────────────────────────────────────────────────────
async function runAutoCheckout() {
  const now = new Date();
  const todayPKTStr = getTodayPKTStr(now);
  const officeConf = await getOfficeConfig();
  const openRecords = await getOpenRecords(todayPKTStr);

  if (openRecords.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No forgotten check-outs found.",
      processed: 0,
      skipped: 0,
      total: 0,
      results: [],
    });
  }

  let processedCount = 0;
  let skippedCount = 0;
  const results = [];

  for (const record of openRecords) {
    try {
      const checkInDate =
        record.check_in instanceof Date
          ? record.check_in
          : new Date(record.check_in as string);

      // Get date string for this record (PKT)
      const dateStr =
        record.date instanceof Date
          ? record.date.toISOString().split("T")[0]
          : String(record.date).split("T")[0];

      // Allowed break for this day (Friday vs normal)
      const allowedBreak = getAllowedBreakForDate(dateStr, {
        break_minutes_default: officeConf.break_minutes_default,
        break_minutes_friday: officeConf.break_minutes_friday,
      });

      // Actual break taken from break_sessions
      const actualBreakTaken = await getActualBreakMinutes(record.id);

      // Deduct the lesser of actual or allowed
      // (overtime minutes beyond allowed are handled by payroll break_deduction)
      const breakToDeduct =
        actualBreakTaken > 0
          ? Math.min(actualBreakTaken, allowedBreak)
          : allowedBreak; // no break session = assume full allowed break taken

      const { officeEndUTC, totalHours, status, skip } = computeCheckout(
        checkInDate,
        officeConf.office_end,
        now,
        breakToDeduct,
      );

      if (skip) {
        skippedCount++;
        continue;
      }

      const breakNote =
        actualBreakTaken > 0
          ? `${Math.min(actualBreakTaken, allowedBreak).toFixed(0)}m break deducted`
          : `${allowedBreak}m break deducted (no session recorded)`;

      await db
        .update(attendance)
        .set({
          check_out: officeEndUTC,
          total_hours: String(totalHours),
          status,
          notes: record.notes
            ? `${record.notes}\n[Auto-checkout: forgot to check out, ${breakNote}]`
            : `[Auto-checkout: forgot to check out, ${breakNote}]`,
        })
        .where(eq(attendance.id, record.id));

      const monthDate = new Date(
        checkInDate.getFullYear(),
        checkInDate.getMonth(),
        1,
      );
      recalculateUserPayroll(record.user_id, monthDate).catch((err) =>
        console.error(
          `[Auto-checkout] Payroll recalc failed for ${record.user_id}:`,
          err,
        ),
      );

      results.push({
        attendance_id: record.id,
        user_id: record.user_id,
        userName: record.userName ?? "—",
        check_in: checkInDate.toISOString(),
        auto_check_out: officeEndUTC.toISOString(),
        break_deducted_minutes: breakToDeduct,
        total_hours: totalHours,
        status,
      });

      processedCount++;
    } catch (err) {
      console.error(
        `[Auto-checkout] Error processing record ${record.id}:`,
        err,
      );
    }
  }

  return NextResponse.json({
    success: true,
    message: `Fixed ${processedCount} forgotten check-out(s).${skippedCount > 0 ? ` ${skippedCount} skipped.` : ""}`,
    processed: processedCount,
    skipped: skippedCount,
    total: openRecords.length,
    results,
  });
}

// ── Preview logic ─────────────────────────────────────────────────────────────
async function runPreview() {
  const now = new Date();
  const todayPKTStr = getTodayPKTStr(now);
  const officeConf = await getOfficeConfig();
  const openRecords = await getOpenRecords(todayPKTStr);

  const toDisplayPKT = (d: Date) => {
    const pkt = new Date(d.getTime() + PKT_OFFSET_MS);
    return pkt.toISOString().replace("T", " ").slice(0, 16) + " PKT";
  };

  const preview = await Promise.all(
    openRecords.map(async (r) => {
      const checkInDate =
        r.check_in instanceof Date
          ? r.check_in
          : new Date(r.check_in as string);

      const dateStr =
        r.date instanceof Date
          ? r.date.toISOString().split("T")[0]
          : String(r.date).split("T")[0];

      const allowedBreak = getAllowedBreakForDate(dateStr, {
        break_minutes_default: officeConf.break_minutes_default,
        break_minutes_friday: officeConf.break_minutes_friday,
      });

      const actualBreakTaken = await getActualBreakMinutes(r.id);
      const breakToDeduct =
        actualBreakTaken > 0
          ? Math.min(actualBreakTaken, allowedBreak)
          : allowedBreak;

      const { officeEndUTC, totalHours, status, skip } = computeCheckout(
        checkInDate,
        officeConf.office_end,
        now,
        breakToDeduct,
      );

      return {
        attendance_id: r.id,
        user_id: r.user_id,
        userName: r.userName ?? "—",
        userRole: r.userRole ?? "—",
        date: dateStr,
        check_in_pkt: toDisplayPKT(checkInDate),
        check_out_pkt: skip ? null : toDisplayPKT(officeEndUTC),
        check_out_utc: skip ? null : officeEndUTC.toISOString(),
        break_deducted_minutes: skip ? null : breakToDeduct,
        total_hours: skip ? null : totalHours,
        status: skip ? null : status,
        will_process: !skip,
        skip_reason: skip,
      };
    }),
  );

  const toProcess = preview.filter((r) => r.will_process);
  const toSkip = preview.filter((r) => !r.will_process);

  return NextResponse.json({
    office_end_time: officeConf.office_end,
    today_pkt: todayPKTStr,
    total: openRecords.length,
    will_process: toProcess.length,
    will_skip: toSkip.length,
    records: preview,
  });
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (isCronRequest(req)) {
    try {
      return await runAutoCheckout();
    } catch (err) {
      console.error("GET (cron) /api/attendance/auto-checkout:", err);
      return NextResponse.json(
        { error: "Auto-checkout failed" },
        { status: 500 },
      );
    }
  }

  if (!(await isAdminSession()))
    return new Response("Unauthorized", { status: 401 });

  try {
    return await runPreview();
  } catch (err) {
    console.error("GET (preview) /api/attendance/auto-checkout:", err);
    return NextResponse.json(
      { error: "Failed to fetch preview" },
      { status: 500 },
    );
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await isAdminSession()))
    return new Response("Unauthorized", { status: 401 });

  try {
    return await runAutoCheckout();
  } catch (err) {
    console.error("POST /api/attendance/auto-checkout:", err);
    return NextResponse.json(
      { error: "Failed to process auto check-outs" },
      { status: 500 },
    );
  }
}
