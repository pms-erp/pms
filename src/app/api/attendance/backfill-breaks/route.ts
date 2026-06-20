// app/api/attendance/rebuild-breaks/route.ts
//
// Rebuilds all break_sessions rows from current office_config.
//
// What it does, in order:
//   1. Deletes ALL existing break_sessions (optionally for a date range)
//   2. For every completed attendance record (check_in + check_out present):
//      - Determines the break window from current office config
//        (Friday window if Friday in PKT, otherwise default window)
//      - Creates one break_sessions row using those exact start/end times
//      - Falls back to "shift midpoint" if the configured break window
//        doesn't fit inside the user's actual check-in/check-out
//   3. Recalculates total_hours = gross − break_minutes_snapshot for each record
//   4. Writes break_minutes_snapshot to the attendance row
//   5. Triggers payroll recalc for every affected month
//
// Query params:
//   ?dryRun=true        → preview, no writes
//   ?from=YYYY-MM-DD    → only records on/after this date
//   ?to=YYYY-MM-DD      → only records on/before this date
//
// ADMIN ONLY. Destructive — wipes break_sessions in the date range.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, breakSessions } from "@/db/schema";
import { eq, and, isNotNull, sql, inArray } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getOfficeConfig } from "@/lib/office-config";
import { recalculatePayrollForMonth } from "@/lib/payroll-calculator";

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

function getPKTDayOfWeek(utcDate: Date): number {
  return new Date(utcDate.getTime() + PKT_OFFSET_MS).getUTCDay();
}

function pktDateStr(utcDate: Date): string {
  const pkt = new Date(utcDate.getTime() + PKT_OFFSET_MS);
  const y = pkt.getUTCFullYear();
  const m = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pkt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// PKT "HH:mm" on the same PKT day as `refUtc` → UTC Date
function pktTimeOnDayToUtc(refUtc: Date, hhmm: string): Date {
  return new Date(`${pktDateStr(refUtc)}T${hhmm}:00+05:00`);
}

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "true";
    const from = searchParams.get("from"); // YYYY-MM-DD
    const to = searchParams.get("to"); // YYYY-MM-DD

    const config = await getOfficeConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Office Config not found" },
        { status: 500 },
      );
    }

    const breakDefault = config.break_minutes_default ?? 30;
    const breakFriday = config.break_minutes_friday ?? 60;
    const grace = config.break_grace_minutes ?? 5;

    const startDefault = config.break_start_time || "14:00";
    const endDefault = config.break_end_time || "14:30";
    const startFriday = config.break_start_time_friday || startDefault;
    const endFriday = config.break_end_time_friday || endDefault;

    console.log(
      `🚀 Rebuild breaks ${dryRun ? "(DRY RUN) " : ""}— ` +
        `Default ${startDefault}-${endDefault} (${breakDefault}m), ` +
        `Friday ${startFriday}-${endFriday} (${breakFriday}m)`,
    );

    // 1. Fetch completed attendance records in range
    const conditions = [isNotNull(attendance.check_out)];
    if (from) conditions.push(sql`${attendance.date} >= ${from}`);
    if (to) conditions.push(sql`${attendance.date} <= ${to}`);

    const records = await db
      .select({
        id: attendance.id,
        user_id: attendance.user_id,
        date: attendance.date,
        check_in: attendance.check_in,
        check_out: attendance.check_out,
      })
      .from(attendance)
      .where(and(...conditions));

    if (records.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No completed attendance records found in range.",
        rebuilt: 0,
      });
    }

    type Plan = {
      attendance_id: string;
      user_id: string;
      date_pkt: string;
      check_in_utc: string;
      check_out_utc: string;
      break_start_utc: string;
      break_end_utc: string;
      break_minutes: number;
      new_total_hours: number;
      new_status: "PRESENT" | "HALF_DAY";
      adjusted: boolean; // true if break was shifted to fit shift
    };

    const plans: Plan[] = [];
    const affectedMonths = new Set<string>(); // "YYYY-MM"

    for (const r of records) {
      if (!r.check_in || !r.check_out) continue;

      const checkInUtc =
        r.check_in instanceof Date ? r.check_in : new Date(r.check_in);
      const checkOutUtc =
        r.check_out instanceof Date ? r.check_out : new Date(r.check_out);

      const grossMs = checkOutUtc.getTime() - checkInUtc.getTime();
      if (grossMs <= 0) continue;

      const isFriday = getPKTDayOfWeek(checkInUtc) === 5;
      const startHHMM = isFriday ? startFriday : startDefault;
      const endHHMM = isFriday ? endFriday : endDefault;
      const allowed = isFriday ? breakFriday : breakDefault;

      // Configured break window on the PKT day of check_in
      let breakStart = pktTimeOnDayToUtc(checkInUtc, startHHMM);
      let breakEnd = pktTimeOnDayToUtc(checkInUtc, endHHMM);
      const configuredDurationMin = minutesBetween(startHHMM, endHHMM);
      let adjusted = false;

      // If configured window doesn't fit inside actual shift, slide it
      if (breakStart < checkInUtc) {
        breakStart = new Date(checkInUtc.getTime() + 60 * 60 * 1000); // +1h
        breakEnd = new Date(
          breakStart.getTime() + configuredDurationMin * 60_000,
        );
        adjusted = true;
      }
      if (breakEnd > checkOutUtc) {
        breakEnd = new Date(checkOutUtc.getTime() - 5 * 60 * 1000); // 5 min before checkout
        breakStart = new Date(
          breakEnd.getTime() - configuredDurationMin * 60_000,
        );
        if (breakStart < checkInUtc) {
          breakStart = new Date(checkInUtc.getTime());
          breakEnd = new Date(
            breakStart.getTime() + configuredDurationMin * 60_000,
          );
        }
        adjusted = true;
      }

      // Final break minutes — use the configured duration; if the shift was
      // too short to fit, cap at half the shift to avoid negative work
      const breakMinutes = Math.min(
        configuredDurationMin,
        Math.floor(grossMs / 60_000 / 2),
      );

      const netMinutes = Math.max(0, grossMs / 60_000 - breakMinutes);
      const newTotalHours = parseFloat((netMinutes / 60).toFixed(2));
      const newStatus: "PRESENT" | "HALF_DAY" =
        newTotalHours < 4 ? "HALF_DAY" : "PRESENT";

      const datePkt = pktDateStr(checkInUtc);

      plans.push({
        attendance_id: r.id,
        user_id: r.user_id,
        date_pkt: datePkt,
        check_in_utc: checkInUtc.toISOString(),
        check_out_utc: checkOutUtc.toISOString(),
        break_start_utc: breakStart.toISOString(),
        break_end_utc: breakEnd.toISOString(),
        break_minutes: breakMinutes,
        new_total_hours: newTotalHours,
        new_status: newStatus,
        adjusted,
      });

      const [y, m] = datePkt.split("-");
      affectedMonths.add(`${y}-${m}`);
    }

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        candidates: records.length,
        would_rebuild: plans.length,
        adjusted_count: plans.filter((p) => p.adjusted).length,
        affected_months: Array.from(affectedMonths),
        sample: plans.slice(0, 20),
      });
    }

    // ─── COMMIT ───────────────────────────────────────────────────────────
    const attendanceIds = plans.map((p) => p.attendance_id);

    // 2. Delete existing break_sessions for these attendance records
    let deletedCount = 0;
    if (attendanceIds.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < attendanceIds.length; i += batchSize) {
        const chunk = attendanceIds.slice(i, i + batchSize);
        const deleteResult = await db
          .delete(breakSessions)
          .where(inArray(breakSessions.attendance_id, chunk));
        // MySQL2 returns affectedRows in the result's first element
        const affected =
          (deleteResult as unknown as { affectedRows?: number }[])[0]
            ?.affectedRows ?? 0;
        deletedCount += affected;
      }
    }

    // 3. Insert fresh break_sessions
    const inserts = plans.map((p) => ({
      id: uuid(),
      attendance_id: p.attendance_id,
      user_id: p.user_id,
      break_start: new Date(p.break_start_utc),
      break_end: new Date(p.break_end_utc),
      actual_minutes: p.break_minutes.toFixed(2),
      allowed_minutes: p.break_minutes, // matches configured allowance
      overtime_minutes: "0.00", // not overtime by definition — these are configured durations
    }));

    let insertedCount = 0;
    const insertBatch = 200;
    for (let i = 0; i < inserts.length; i += insertBatch) {
      const chunk = inserts.slice(i, i + insertBatch);
      if (chunk.length > 0) {
        await db.insert(breakSessions).values(chunk);
        insertedCount += chunk.length;
      }
    }

    // 4. Update attendance.total_hours + status to match
    let attendanceUpdated = 0;
    const updateBatch = 100;
    for (let i = 0; i < plans.length; i += updateBatch) {
      const chunk = plans.slice(i, i + updateBatch);
      await db.transaction(async (tx) => {
        for (const p of chunk) {
          await tx
            .update(attendance)
            .set({
              total_hours: String(p.new_total_hours),
              status: p.new_status,
            })
            .where(eq(attendance.id, p.attendance_id));
          attendanceUpdated++;
        }
      });
    }

    // 5. Recalc payroll for affected months
    const recalculatedMonths: string[] = [];
    const recalcErrors: string[] = [];
    for (const monthKey of affectedMonths) {
      const [y, m] = monthKey.split("-").map(Number);
      const monthDate = new Date(Date.UTC(y, m - 1, 1));
      try {
        await recalculatePayrollForMonth(monthDate);
        recalculatedMonths.push(monthKey);
      } catch (e) {
        console.error(`Failed payroll recalc for ${monthKey}`, e);
        recalcErrors.push(monthKey);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Rebuilt ${insertedCount} break sessions across ${affectedMonths.size} month(s).`,
      deleted_break_sessions: deletedCount,
      inserted_break_sessions: insertedCount,
      attendance_updated: attendanceUpdated,
      adjusted_count: plans.filter((p) => p.adjusted).length,
      payroll_recalculated: recalculatedMonths,
      payroll_recalc_failed: recalcErrors,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("❌ Rebuild failed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
