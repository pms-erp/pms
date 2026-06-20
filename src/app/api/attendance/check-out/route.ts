import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, breakSessions } from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { isWithinAllowedLocation } from "@/lib/attendance-location";
import { getOfficeConfig } from "@/lib/office-config";
import { recalculateUserPayroll } from "@/lib/payroll-calculator";

const HALF_DAY_HOURS = 4;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let body: { latitude?: number; longitude?: number } = {};
    try {
      body = await req.json();
    } catch {}

    if (body.latitude == null || body.longitude == null)
      return NextResponse.json(
        { error: "Location is required to check out" },
        { status: 400 },
      );

    const userId = session.user.id;
    const now = new Date();

    const { allowed, locationName, reason } = await isWithinAllowedLocation(
      body.latitude,
      body.longitude,
      userId,
    );
    if (!allowed)
      return NextResponse.json(
        { error: reason ?? "You are not at an allowed location to check out." },
        { status: 403 },
      );

    const record = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (!record)
      return NextResponse.json(
        { error: "You haven't checked in today" },
        { status: 409 },
      );

    const officeConf = await getOfficeConfig();

    // ✅ Auto-close break ONLY if tracking enabled
    if (officeConf.break_tracking_enabled) {
      const openBreak = await db
        .select()
        .from(breakSessions)
        .where(
          and(
            eq(breakSessions.attendance_id, record.id),
            isNull(breakSessions.break_end),
          ),
        )
        .limit(1)
        .then((r) => r[0] ?? null);
      if (openBreak) {
        const breakStart =
          openBreak.break_start instanceof Date
            ? openBreak.break_start
            : new Date(openBreak.break_start);
        const actualMs = now.getTime() - breakStart.getTime();
        const actualMinutes = parseFloat((actualMs / 60000).toFixed(2));
        const overtime = Math.max(
          0,
          actualMinutes -
            openBreak.allowed_minutes -
            officeConf.break_grace_minutes,
        );
        await db
          .update(breakSessions)
          .set({
            break_end: now,
            actual_minutes: String(actualMinutes.toFixed(2)),
            overtime_minutes: String(overtime.toFixed(2)),
          })
          .where(eq(breakSessions.id, openBreak.id));
      }
    }

    // ✅ Sum break minutes ONLY if tracking enabled
    let totalActualBreakMinutes = 0;
    if (officeConf.break_tracking_enabled) {
      const todayBreaks = await db
        .select({ actual_minutes: breakSessions.actual_minutes })
        .from(breakSessions)
        .where(
          and(
            eq(breakSessions.attendance_id, record.id),
            isNotNull(breakSessions.break_end),
          ),
        );
      totalActualBreakMinutes = todayBreaks.reduce(
        (sum, b) => sum + parseFloat(String(b.actual_minutes ?? 0)),
        0,
      );
    }

    const totalBreakMs = totalActualBreakMinutes * 60_000;
    const checkInTime =
      record.check_in instanceof Date
        ? record.check_in
        : new Date(record.check_in);
    const totalMs = now.getTime() - checkInTime.getTime() - totalBreakMs;
    const totalHours = parseFloat(
      (Math.max(0, totalMs) / 3_600_000).toFixed(2),
    );
    const status = totalHours < HALF_DAY_HOURS ? "HALF_DAY" : "PRESENT";

    await db
      .update(attendance)
      .set({
        check_out: now,
        total_hours: String(totalHours),
        status: status as "PRESENT" | "HALF_DAY",
      })
      .where(eq(attendance.id, record.id));

    const monthDate = new Date(now.getFullYear(), now.getMonth(), 1);
    recalculateUserPayroll(userId, monthDate).catch((err) =>
      console.error("[check-out] payroll recalc failed:", err),
    );

    return NextResponse.json({
      success: true,
      check_out: now.toISOString(),
      total_hours: totalHours,
      status,
      location: locationName,
    });
  } catch (err) {
    console.error("POST /api/attendance/check-out:", err);
    return NextResponse.json({ error: "Failed to check out" }, { status: 500 });
  }
}
