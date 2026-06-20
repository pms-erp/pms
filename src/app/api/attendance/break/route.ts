// app/api/attendance/break/route.ts
//
// Break auto-start rules:
//   1. break_tracking_enabled must be true
//   2. Current time must be within today's break window (PKT-aware)
//   3. User must have been checked in BEFORE the break window opened
//   4. No break already taken or in progress today
//
// TIMEZONE FIX:
//   All break window comparisons now use parseTimeOnDayPKT + getBreakWindowForDatePKT
//   instead of the naive parseTimeOnDay / getBreakWindowForDate.
//   The naive versions call setHours() which uses server local time — on Vercel
//   (UTC) that made "14:00 PKT" fire at 19:00 PKT (5 hours late).
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, breakSessions } from "@/db/schema";
import { eq, and, isNull, isNotNull, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import {
  getOfficeConfig,
  getAllowedBreakMinutes,
  parseTimeOnDayPKT,
  getBreakWindowForDatePKT,
} from "@/lib/office-config";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function safeGetOfficeConfig() {
  try {
    return await getOfficeConfig();
  } catch (err) {
    console.error("getOfficeConfig failed:", err);
    return null;
  }
}

async function autoStartBreakIfNeeded(
  attendanceId: string,
  userId: string,
  checkInTime: Date,
): Promise<{
  breakRow: typeof breakSessions.$inferSelect | null;
  wasAutoStarted: boolean;
}> {
  const config = await safeGetOfficeConfig();
  if (!config?.break_tracking_enabled)
    return { breakRow: null, wasAutoStarted: false };

  const now = new Date();
  const breakWindow = getBreakWindowForDatePKT(config, now);
  const breakWindowStart = parseTimeOnDayPKT(breakWindow.start, now);
  const breakWindowEnd = parseTimeOnDayPKT(breakWindow.end, now);

  // FIX: extend the window by grace minutes on BOTH sides.
  // This catches:
  //   - Users who check in a few minutes after break window opens
  //   - Users whose GET request arrives just after window closes
  const graceMs = config.break_grace_minutes * 60 * 1000;
  const windowOpenWithGrace = new Date(breakWindowStart.getTime() - graceMs);
  const windowCloseWithGrace = new Date(breakWindowEnd.getTime() + graceMs);

  if (now < windowOpenWithGrace || now > windowCloseWithGrace)
    return { breakRow: null, wasAutoStarted: false };

  // Already has an open break → return it (idempotent)
  const existing = await db
    .select()
    .from(breakSessions)
    .where(
      and(
        eq(breakSessions.attendance_id, attendanceId),
        isNull(breakSessions.break_end),
      ),
    )
    .limit(1)
    .then((r) => r[0] ?? null);
  if (existing) return { breakRow: existing, wasAutoStarted: false };

  // Already has a completed break today → don't double-start
  const completedToday = await db
    .select({ id: breakSessions.id })
    .from(breakSessions)
    .where(
      and(
        eq(breakSessions.attendance_id, attendanceId),
        isNotNull(breakSessions.break_end),
      ),
    )
    .orderBy(desc(breakSessions.created_at))
    .limit(1)
    .then((r) => r[0] ?? null);
  if (completedToday) return { breakRow: null, wasAutoStarted: false };

  // Use official window start when user was already in before break,
  // or their actual check-in time when they arrived during the window.
  const effectiveStart =
    checkInTime >= breakWindowStart
      ? new Date(checkInTime)
      : new Date(breakWindowStart);

  const allowed = getAllowedBreakMinutes(config, now);
  const id = uuid();

  await db.insert(breakSessions).values({
    id,
    attendance_id: attendanceId,
    user_id: userId,
    break_start: effectiveStart,
    allowed_minutes: allowed,
    overtime_minutes: "0",
  });

  const newRow = await db
    .select()
    .from(breakSessions)
    .where(eq(breakSessions.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);

  return { breakRow: newRow, wasAutoStarted: true };
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;

    const openAttendance = await db
      .select({ id: attendance.id, check_in: attendance.check_in })
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!openAttendance)
      return NextResponse.json({ status: "NOT_CHECKED_IN", break: null });

    const config = await safeGetOfficeConfig();

    if (!config) {
      return NextResponse.json({
        status: "CHECKED_IN",
        config: { break_tracking_enabled: false },
        break: null,
        isBreakTime: false,
        isAfterBreak: false,
        todayStats: {
          totalBreakMinutes: 0,
          totalOvertimeMinutes: 0,
          breakCount: 0,
        },
      });
    }

    const now = new Date();

    // PKT-safe window + time comparisons
    const breakWindow = getBreakWindowForDatePKT(config, now);
    const breakWindowStart = parseTimeOnDayPKT(breakWindow.start, now);
    const breakWindowEnd = parseTimeOnDayPKT(breakWindow.end, now);
    const isBreakTime = now >= breakWindowStart && now <= breakWindowEnd;
    const isAfterBreak = now > breakWindowEnd;

    const checkInTime =
      openAttendance.check_in instanceof Date
        ? openAttendance.check_in
        : new Date(openAttendance.check_in);

    const { breakRow: autoBreak, wasAutoStarted } =
      await autoStartBreakIfNeeded(openAttendance.id, userId, checkInTime);

    const openBreak =
      autoBreak ??
      (await db
        .select()
        .from(breakSessions)
        .where(
          and(
            eq(breakSessions.attendance_id, openAttendance.id),
            isNull(breakSessions.break_end),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null));

    if (openBreak) {
      const breakStart =
        openBreak.break_start instanceof Date
          ? openBreak.break_start
          : new Date(openBreak.break_start);
      const elapsedMs = now.getTime() - breakStart.getTime();
      const elapsedMinutes = elapsedMs / 60000;
      const allowedWithGrace =
        openBreak.allowed_minutes + config.break_grace_minutes;
      const overtimeSoFar = Math.max(0, elapsedMinutes - allowedWithGrace);

      return NextResponse.json({
        status: "ON_BREAK",
        wasAutoStarted,
        attendanceId: openAttendance.id,
        isBreakTime,
        break: {
          id: openBreak.id,
          break_start: breakStart.toISOString(),
          allowed_minutes: openBreak.allowed_minutes,
          grace_minutes: config.break_grace_minutes,
          current_overtime_minutes: parseFloat(overtimeSoFar.toFixed(2)),
          deadline_time: new Date(
            breakStart.getTime() + allowedWithGrace * 60000,
          ).toISOString(),
        },
        config: {
          break_start_time: config.break_start_time,
          break_end_time: config.break_end_time,
          break_start_time_friday: config.break_start_time_friday,
          break_end_time_friday: config.break_end_time_friday,
          break_tracking_enabled: config.break_tracking_enabled,
        },
      });
    }

    const todaysBreaks = await db
      .select()
      .from(breakSessions)
      .where(
        and(
          eq(breakSessions.attendance_id, openAttendance.id),
          isNotNull(breakSessions.break_end),
        ),
      )
      .orderBy(desc(breakSessions.created_at));

    const totalBreakMinutes = todaysBreaks.reduce(
      (sum, b) => sum + parseFloat(String(b.actual_minutes ?? 0)),
      0,
    );
    const totalOvertime = todaysBreaks.reduce(
      (sum, b) => sum + parseFloat(String(b.overtime_minutes ?? 0)),
      0,
    );

    return NextResponse.json({
      status: "CHECKED_IN",
      attendanceId: openAttendance.id,
      isBreakTime,
      isAfterBreak,
      break: null,
      config: {
        break_start_time: config.break_start_time,
        break_end_time: config.break_end_time,
        break_start_time_friday: config.break_start_time_friday,
        break_end_time_friday: config.break_end_time_friday,
        break_tracking_enabled: config.break_tracking_enabled,
      },
      todayStats: {
        totalBreakMinutes: parseFloat(totalBreakMinutes.toFixed(2)),
        totalOvertimeMinutes: parseFloat(totalOvertime.toFixed(2)),
        breakCount: todaysBreaks.length,
      },
    });
  } catch (err) {
    console.error("GET /api/attendance/break:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    const body = (await req.json()) as { action: "end" };

    if (body.action !== "end")
      return NextResponse.json(
        {
          error: "Only action 'end' is supported. Break starts automatically.",
        },
        { status: 400 },
      );

    const openAttendance = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!openAttendance)
      return NextResponse.json(
        { error: "You must be checked in" },
        { status: 409 },
      );

    const config = await safeGetOfficeConfig();
    if (!config?.break_tracking_enabled)
      return NextResponse.json(
        { error: "Break tracking is disabled" },
        { status: 403 },
      );

    const now = new Date();
    const openBreak = await db
      .select()
      .from(breakSessions)
      .where(
        and(
          eq(breakSessions.attendance_id, openAttendance.id),
          isNull(breakSessions.break_end),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!openBreak)
      return NextResponse.json(
        { error: "No active break found" },
        { status: 409 },
      );

    const breakStart =
      openBreak.break_start instanceof Date
        ? openBreak.break_start
        : new Date(openBreak.break_start);
    const actualMs = now.getTime() - breakStart.getTime();
    const actualMinutes = parseFloat((actualMs / 60000).toFixed(2));
    const allowedWithGrace =
      openBreak.allowed_minutes + config.break_grace_minutes;
    const overtime = Math.max(0, actualMinutes - allowedWithGrace);

    await db
      .update(breakSessions)
      .set({
        break_end: now,
        actual_minutes: String(actualMinutes.toFixed(2)),
        overtime_minutes: String(overtime.toFixed(2)),
      })
      .where(eq(breakSessions.id, openBreak.id));

    return NextResponse.json({
      success: true,
      actual_minutes: actualMinutes,
      allowed_minutes: openBreak.allowed_minutes,
      grace_minutes: config.break_grace_minutes,
      overtime_minutes: overtime,
      over_limit: overtime > 0,
      message:
        overtime > 0
          ? `Break ended ${overtime.toFixed(1)}m over the limit. This will be deducted from your salary.`
          : `Break ended on time (${actualMinutes.toFixed(0)}m / ${openBreak.allowed_minutes}m allowed).`,
    });
  } catch (err) {
    console.error("POST /api/attendance/break:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
