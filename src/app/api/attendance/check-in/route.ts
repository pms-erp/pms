// app/api/attendance/check-in/route.ts
//
// FIX: Stale session auto-close now uses check_in + office_duration
// instead of date + office_end. Same logic as auto-checkout cron.
//
// Also skips closing stale sessions if the expected end time hasn't
// passed yet — cross-midnight worker might still be active.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { isWithinAllowedLocation } from "@/lib/attendance-location";
import { getOfficeConfig } from "@/lib/office-config";
import { recalculateUserPayroll } from "@/lib/payroll-calculator";

/** Returns office work duration in milliseconds */
function getOfficeDurationMs(officeStart: string, officeEnd: string): number {
  const [sh, sm] = officeStart.split(":").map(Number);
  const [eh, em] = officeEnd.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) * 60 * 1000;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json()) as {
      latitude?: number;
      longitude?: number;
    };

    if (body.latitude == null || body.longitude == null)
      return NextResponse.json(
        { error: "Location is required to check in" },
        { status: 400 },
      );

    const userId = session.user.id;
    const now = new Date();

    // ── Location check ─────────────────────────────────────────────────────
    const { allowed, locationName, reason } = await isWithinAllowedLocation(
      body.latitude,
      body.longitude,
      userId,
    );
    if (!allowed)
      return NextResponse.json(
        { error: reason ?? "Location check failed" },
        { status: 403 },
      );

    // ── Auto-close stale open sessions from previous days ──────────────────
    // Uses check_in + office_duration so late/cross-midnight workers
    // get their full hours credited (not cut off at office_end).
    const officeConf = await getOfficeConfig();
    const officeDurationMs = getOfficeDurationMs(
      officeConf.office_start,
      officeConf.office_end,
    );

    const staleSessions = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.user_id, userId),
          isNull(attendance.check_out),
          sql`DATE(${attendance.check_in}) < CURDATE()`,
        ),
      );

    let autoClosedCount = 0;

    for (const stale of staleSessions) {
      const checkInTime =
        stale.check_in instanceof Date
          ? stale.check_in
          : new Date(stale.check_in);

      // Expected checkout = check_in + office duration
      const expectedCheckout = new Date(
        checkInTime.getTime() + officeDurationMs,
      );

      // If the expected shift hasn't ended yet, skip closing
      // (cross-midnight worker may still be active)
      if (expectedCheckout > now) continue;

      const totalMs = Math.max(
        0,
        expectedCheckout.getTime() - checkInTime.getTime(),
      );
      const totalHours = parseFloat((totalMs / 3_600_000).toFixed(2));
      const status = totalHours < 4 ? "HALF_DAY" : "PRESENT";

      await db
        .update(attendance)
        .set({
          check_out: expectedCheckout,
          total_hours: String(totalHours),
          status: status as "PRESENT" | "HALF_DAY",
          notes: stale.notes
            ? `${stale.notes}\n[Auto-checkout: Forgot to check out]`
            : "[Auto-checkout: Forgot to check out]",
        })
        .where(eq(attendance.id, stale.id));

      // Recalculate payroll for the month of that check-in
      const staleMonth = new Date(
        checkInTime.getFullYear(),
        checkInTime.getMonth(),
        1,
      );
      recalculateUserPayroll(userId, staleMonth).catch((err) =>
        console.error("[check-in] stale payroll recalc failed:", err),
      );

      autoClosedCount++;
    }

    // ── Already checked in today (open session)? ───────────────────────────
    const openSession = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(and(eq(attendance.user_id, userId), isNull(attendance.check_out)))
      .then((r) => r[0] ?? null);

    if (openSession)
      return NextResponse.json(
        { error: "Already checked in" },
        { status: 409 },
      );

    // ── Already completed today? ───────────────────────────────────────────
    const completedToday = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(
          eq(attendance.user_id, userId),
          sql`DATE(${attendance.check_in}) = CURDATE()`,
          isNotNull(attendance.check_out),
        ),
      )
      .then((r) => r[0] ?? null);

    if (completedToday)
      return NextResponse.json(
        { error: "Already completed attendance for today" },
        { status: 409 },
      );

    // ── Insert new check-in ────────────────────────────────────────────────
    const id = uuid();
    await db.insert(attendance).values({
      id,
      user_id: userId,
      date: sql`CURDATE()`,
      check_in: now,
      status: "PRESENT",
    });

    return NextResponse.json({
      success: true,
      id,
      check_in: now.toISOString(),
      location: locationName,
      autoClosedPrevious: autoClosedCount > 0 ? autoClosedCount : undefined,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "ER_DUP_ENTRY")
      return NextResponse.json(
        { error: "Already have an attendance record for today" },
        { status: 409 },
      );
    console.error("POST /api/attendance/check-in:", err);
    return NextResponse.json({ error: "Failed to check in" }, { status: 500 });
  }
}
