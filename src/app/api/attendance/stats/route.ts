// app/api/attendance/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users } from "@/db/schema";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

// PKT helper
function getPKTDateStr(date: Date): string {
  return date
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");
}

// 🔑 Generate PKT-aware date range INCLUDING Sundays (for display)
function getPKTDateRange(from: string, to: string, todayPKT: string): string[] {
  const dates: string[] = [];
  const actualEnd = to > todayPKT ? todayPKT : to;

  const current = new Date(`${from}T00:00:00+05:00`);
  while (true) {
    const currentPKT = getPKTDateStr(current);
    if (currentPKT > actualEnd) break;
    dates.push(currentPKT); // Include ALL days
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// 🔑 Check if PKT date is Sunday
function isPKTSunday(dateStr: string): boolean {
  const date = new Date(`${dateStr}T00:00:00+05:00`);
  return date.getUTCDay() === 0;
}

function normalizeAttendanceDate(date: string | Date): string {
  return typeof date === "string" ? date : getPKTDateStr(new Date(date));
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const teamLeaderId = searchParams.get("teamLeaderId");
    const from =
      searchParams.get("from") || new Date().toISOString().split("T")[0];
    const to = searchParams.get("to") || from;
    const scope =
      (searchParams.get("scope") as "single" | "team" | "all") || "single";
    const todayPKT = searchParams.get("todayPKT") || getPKTDateStr(new Date());

    // Determine user scope
    let userIds: string[] = [];

    if (scope === "single" && userId) {
      userIds = [userId];
    } else if (scope === "team" && teamLeaderId) {
      const team = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.team_leader_id, teamLeaderId));
      userIds = team.map((u) => u.id);
    } else if (
      scope === "all" &&
      (session.user.role === "ADMIN" ||
        session.user.role === "ATTENDANCE_MANAGER")
    ) {
      const all = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.is_active, true));
      userIds = all.map((u) => u.id);
    } else {
      userIds = [session.user.id];
    }

    if (userIds.length === 0) {
      return NextResponse.json({
        stats: {
          total: 0,
          present: 0,
          halfDay: 0,
          absent: 0,
          holiday: 0,
          avgHours: 0,
        },
      });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Fetch existing attendance records
    const records = await db
      .select()
      .from(attendance)
      .where(
        and(
          inArray(attendance.user_id, userIds),
          gte(attendance.date, fromDate),
          lte(attendance.date, toDate),
        ),
      );

    // Generate ALL dates including Sundays
    const dates = getPKTDateRange(from, to, todayPKT);

    // Calculate stats
    let present = 0,
      halfDay = 0,
      absent = 0,
      holiday = 0,
      totalHours = 0,
      presentCount = 0;

    for (const date of dates) {
      for (const uid of userIds) {
        if (isPKTSunday(date)) {
          // 🔑 Sunday = Holiday (not counted in working days stats)
          holiday++;
        } else {
          // Working day: check for record
          const record = records.find(
            (r) =>
              r.user_id === uid && normalizeAttendanceDate(r.date) === date,
          );

          if (record) {
            if (record.status === "PRESENT") present++;
            else if (record.status === "HALF_DAY") halfDay++;
            // Note: ABSENT records from DB are counted as absent
            totalHours += parseFloat(record.total_hours ?? "0");
            presentCount++;
          } else {
            // No record on working day = Absent
            absent++;
          }
        }
      }
    }

    // 🔑 total = working days only (excludes holidays)
    const total = present + halfDay + absent;
    const avgHours =
      presentCount > 0 ? parseFloat((totalHours / presentCount).toFixed(1)) : 0;

    return NextResponse.json({
      stats: { total, present, halfDay, absent, holiday, avgHours },
    });
  } catch (err) {
    console.error("Stats API error:", err);
    return NextResponse.json(
      { error: "Failed to load stats" },
      { status: 500 },
    );
  }
}
