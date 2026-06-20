// app/api/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { attendance, users, breakSessions } from "@/db/schema";
import { eq, and, desc, sql, inArray, isNotNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { recalculateUserPayroll } from "@/lib/payroll-calculator";
import { getOfficeConfig } from "@/lib/office-config";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OfficeConfigType {
  break_minutes_default: number;
  break_minutes_friday: number;
  break_grace_minutes?: number;
}

interface AttendanceRecordWithBreaks {
  id: string;
  user_id: string;
  date: string;
  check_in: string;
  check_out: string | null;
  total_hours: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  userName: string | null;
  userAvatar: string | null;
  userRole: string | null;
  break_minutes?: number | null;
  break_overtime?: number | null;
  break_count?: number;
}

// ─── Timezone Helper ──────────────────────────────────────────────────────────
function parsePKT(localStr: string): Date {
  if (localStr.includes("+") || localStr.endsWith("Z")) {
    return new Date(localStr);
  }
  const normalized = localStr.length === 16 ? localStr + ":00" : localStr;
  return new Date(normalized + "+05:00");
}

// 🔑 PKT-aware day-of-week check (FIXED for Friday break logic)
function getPKTDayOfWeek(dateStr: string): number {
  // Create a date at noon PKT to avoid midnight edge cases
  const date = new Date(`${dateStr}T12:00:00+05:00`);
  return date.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
}

// ─── Break Helpers ────────────────────────────────────────────────────────────
// 🔑 FIXED: Use PKT-aware day check for Friday break
function getBreakMinutesForDateConfig(
  dateStr: string,
  config: OfficeConfigType | null,
): number {
  if (!config) return 30;
  const dayOfWeek = getPKTDayOfWeek(dateStr); // ✅ PKT-aware: 0=Sun, 5=Fri, 6=Sat
  return dayOfWeek === 5
    ? (config.break_minutes_friday ?? 60)
    : (config.break_minutes_default ?? 30);
}

function calculateNetHoursWithBreak(
  checkInUTC: Date,
  checkOutUTC: Date,
  dateStr: string,
  officeConfig: OfficeConfigType | null,
): number {
  const grossMs = checkOutUTC.getTime() - checkInUTC.getTime();
  const breakMinutes = getBreakMinutesForDateConfig(dateStr, officeConfig);
  const breakMs = breakMinutes * 60 * 1000;
  const netMs = Math.max(0, grossMs - breakMs);
  return parseFloat((netMs / 3_600_000).toFixed(2));
}

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: userId, role } = session.user;
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const targetUser = searchParams.get("userId");
    const includeBreaks = searchParams.get("includeBreaks") === "true";

    const now = new Date();
    const from =
      fromParam ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const to =
      toParam ??
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];

    let userIdFilter: string[] | null = null;
    if (role === "ADMIN" || role === "ATTENDANCE_MANAGER") {
      if (targetUser) userIdFilter = [targetUser];
      else userIdFilter = null;
    } else if (role === "TEAM_LEADER") {
      if (targetUser) {
        userIdFilter = [targetUser];
      } else {
        const teamLeaderUser = await db
          .select({ team_type: users.team_type })
          .from(users)
          .where(eq(users.id, userId))
          .then((r) => r[0] ?? null);
        if (teamLeaderUser?.team_type) {
          const teamMemberRows = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.team_type, teamLeaderUser.team_type));
          const teamIds = teamMemberRows.map((u) => u.id);
          userIdFilter = [...new Set([userId, ...teamIds])];
        } else {
          userIdFilter = [userId];
        }
      }
    } else {
      userIdFilter = [userId];
    }

    const filters = [
      sql`${attendance.date} >= ${from}`,
      sql`${attendance.date} <= ${to}`,
    ];
    if (userIdFilter !== null) {
      if (userIdFilter.length === 1) {
        filters.push(eq(attendance.user_id, userIdFilter[0]));
      } else {
        filters.push(inArray(attendance.user_id, userIdFilter));
      }
    }

    const records = await db
      .select({
        id: attendance.id,
        user_id: attendance.user_id,
        date: attendance.date,
        check_in: attendance.check_in,
        check_out: attendance.check_out,
        total_hours: attendance.total_hours,
        status: attendance.status,
        notes: attendance.notes,
        created_at: attendance.created_at,
        userName: users.name,
        userAvatar: users.avatar,
        userRole: users.role,
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.user_id, users.id))
      .where(and(...filters))
      .orderBy(desc(attendance.date), desc(attendance.check_in));

    // 🔑 If includeBreaks requested, fetch and merge break stats
    if (includeBreaks && records.length > 0) {
      const attendanceIds = records
        .map((r) => r.id)
        .filter((id): id is string => id !== null);
      if (attendanceIds.length > 0) {
        const breakStats = await db
          .select({
            attendance_id: breakSessions.attendance_id,
            total_minutes:
              sql<number>`SUM(CAST(${breakSessions.actual_minutes} AS DECIMAL(10,2)))`.as(
                "total_minutes",
              ),
            total_overtime:
              sql<number>`SUM(CAST(${breakSessions.overtime_minutes} AS DECIMAL(10,2)))`.as(
                "total_overtime",
              ),
            break_count: sql<number>`COUNT(*)`.as("break_count"),
          })
          .from(breakSessions)
          .where(
            and(
              inArray(breakSessions.attendance_id, attendanceIds),
              isNotNull(breakSessions.break_end),
            ),
          )
          .groupBy(breakSessions.attendance_id);

        const breakMap = new Map(
          breakStats.map((s) => [
            s.attendance_id,
            {
              break_minutes: s.total_minutes,
              break_overtime: s.total_overtime,
              break_count: s.break_count,
            },
          ]),
        );

        // 🔑 FIXED: Use type-safe approach instead of (r as any)
        records.forEach((r) => {
          const breaks = breakMap.get(r.id);
          if (breaks) {
            const recordWithBreaks = r as unknown as AttendanceRecordWithBreaks;
            recordWithBreaks.break_minutes = breaks.break_minutes;
            recordWithBreaks.break_overtime = breaks.break_overtime;
            recordWithBreaks.break_count = breaks.break_count;
          }
        });
      }
    }

    const serialized = records.map((r) => ({
      ...r,
      check_in:
        r.check_in instanceof Date ? r.check_in.toISOString() : r.check_in,
      check_out:
        r.check_out instanceof Date
          ? r.check_out.toISOString()
          : (r.check_out ?? null),
      date:
        r.date instanceof Date ? r.date.toISOString().split("T")[0] : r.date,
    }));

    return NextResponse.json({ records: serialized });
  } catch (err) {
    console.error("GET /api/attendance:", err);
    return NextResponse.json(
      { error: "Failed to fetch attendance" },
      { status: 500 },
    );
  }
}

// ─── POST — admin/attendance-manager manually adds a record ──────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user;

    if (role !== "ADMIN" && role !== "ATTENDANCE_MANAGER")
      return NextResponse.json(
        { error: "Only admins can add attendance records manually" },
        { status: 403 },
      );

    const body = (await req.json()) as {
      user_id: string;
      date: string;
      check_in: string;
      check_out?: string | null;
      total_hours?: number | null;
      status: string;
      notes?: string | null;
    };

    if (!body.user_id || !body.date || !body.check_in)
      return NextResponse.json(
        { error: "user_id, date and check_in are required" },
        { status: 400 },
      );

    const todayPKT = new Date(new Date().getTime() + 5 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    if (body.date > todayPKT)
      return NextResponse.json(
        { error: "Cannot add attendance for a future date" },
        { status: 400 },
      );

    const user = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, body.user_id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const existing = await db
      .select({
        id: attendance.id,
        check_in: attendance.check_in,
        check_out: attendance.check_out,
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.user_id, body.user_id),
          sql`${attendance.date} = ${body.date}`,
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

    if (existing) {
      const isGhost = !existing.check_out && existing.check_in instanceof Date;

      if (isGhost) {
        const checkInDate = parsePKT(body.check_in);
        const checkOutDate = body.check_out ? parsePKT(body.check_out) : null;
        let total_hours = body.total_hours ?? null;

        // 🔑 Fetch office config and calculate net hours
        const officeConfig = await getOfficeConfig();
        if (!total_hours && checkOutDate && officeConfig) {
          total_hours = calculateNetHoursWithBreak(
            checkInDate,
            checkOutDate,
            body.date,
            officeConfig,
          );
        }

        let status = body.status ?? "PRESENT";
        if (total_hours && !body.status) {
          status = total_hours < 4 ? "HALF_DAY" : "PRESENT";
        }

        await db
          .update(attendance)
          .set({
            check_in: checkInDate,
            check_out: checkOutDate,
            total_hours: total_hours !== null ? String(total_hours) : null,
            status: status as "PRESENT" | "HALF_DAY" | "ABSENT",
            notes: body.notes ?? null,
          })
          .where(eq(attendance.id, existing.id));

        const [yr, mo] = body.date.split("-").map(Number);
        const monthDate = new Date(yr, mo - 1, 1);
        recalculateUserPayroll(body.user_id, monthDate).catch((err) =>
          console.error("[POST attendance] payroll recalc failed:", err),
        );
        return NextResponse.json(
          { success: true, id: existing.id, updated: true },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          error: `A record already exists for this employee on ${body.date}. Edit the existing record instead.`,
        },
        { status: 409 },
      );
    }

    const checkInDate = parsePKT(body.check_in);
    const checkOutDate = body.check_out ? parsePKT(body.check_out) : null;

    let total_hours = body.total_hours ?? null;

    // 🔑 Fetch office config and calculate net hours if not provided
    if (!total_hours && checkOutDate) {
      const officeConfig = await getOfficeConfig();
      if (officeConfig) {
        total_hours = calculateNetHoursWithBreak(
          checkInDate,
          checkOutDate,
          body.date,
          officeConfig,
        );
      }
    }

    let status = body.status;
    if (!status && total_hours) {
      status = total_hours < 4 ? "HALF_DAY" : "PRESENT";
    }

    const id = uuid();
    await db.insert(attendance).values({
      id,
      user_id: body.user_id,
      date: sql`${body.date}`,
      check_in: checkInDate,
      check_out: checkOutDate,
      total_hours: total_hours !== null ? String(total_hours) : null,
      status: (status ?? "PRESENT") as "PRESENT" | "HALF_DAY" | "ABSENT",
      notes: body.notes ?? null,
    });

    const [yr, mo] = body.date.split("-").map(Number);
    const monthDate = new Date(yr, mo - 1, 1);
    recalculateUserPayroll(body.user_id, monthDate).catch((err) =>
      console.error("[POST attendance] payroll recalc failed:", err),
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "ER_DUP_ENTRY")
      return NextResponse.json(
        { error: "A record already exists for this user on that date" },
        { status: 409 },
      );
    console.error("POST /api/attendance:", err);
    return NextResponse.json(
      { error: "Failed to add attendance record" },
      { status: 500 },
    );
  }
}

// ─── PATCH — edit a record ────────────────────────────────────────────────────
// app/api/attendance/route.ts — PATCH SECTION
//
// Replace ONLY the PATCH function in your existing file with this.
// GET and POST stay the same as your current version.

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { role } = session.user;
    if (role !== "ADMIN" && role !== "ATTENDANCE_MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as {
      id: string;
      check_in?: string | null;
      check_out?: string | null;
      status?: string;
      notes?: string | null;
      total_hours?: number | string | null;
    };

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // 🆕 Clearing check_in deletes the entire attendance record + its breaks.
    // The row will then render as ABSENT via the holiday-generation logic.
    if (
      body.check_in !== undefined &&
      (body.check_in === null || body.check_in === "")
    ) {
      // Fetch the record first so we know the user_id + date for payroll recalc
      const target = await db
        .select({ user_id: attendance.user_id, date: attendance.date })
        .from(attendance)
        .where(eq(attendance.id, body.id))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (!target) {
        return NextResponse.json(
          { error: "Attendance record not found" },
          { status: 404 },
        );
      }

      // Delete break sessions first (in case there's no FK cascade)
      await db
        .delete(breakSessions)
        .where(eq(breakSessions.attendance_id, body.id));

      // Delete the attendance row
      await db.delete(attendance).where(eq(attendance.id, body.id));

      // Recalc payroll for that user/month
      const [yr, mo] =
        target.date instanceof Date
          ? [target.date.getFullYear(), target.date.getMonth() + 1]
          : (target.date as string).split("-").map(Number);
      const monthDate = new Date(Date.UTC(yr, mo - 1, 1));
      recalculateUserPayroll(target.user_id, monthDate).catch((err) =>
        console.error("[PATCH attendance] payroll recalc failed:", err),
      );

      return NextResponse.json({
        success: true,
        deleted: true,
        message: "Record deleted — day now shows as Absent.",
      });
    }

    // ── Otherwise: normal update path ──
    const update: Record<string, unknown> = {};

    if (body.check_in !== undefined) {
      const newCheckIn = parsePKT(body.check_in!);
      update.check_in = newCheckIn;
      const pktDate = new Date(newCheckIn.getTime() + 5 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      update.date = sql`${pktDate}`;
    }

    // check_out: undefined = skip, null/"" = write NULL
    if (body.check_out !== undefined) {
      if (body.check_out === null || body.check_out === "") {
        update.check_out = null;
      } else {
        update.check_out = parsePKT(body.check_out);
      }
    }

    if (body.status !== undefined) {
      update.status = body.status;
    }

    // notes: undefined = skip, null/"" = write NULL
    if (body.notes !== undefined) {
      update.notes =
        body.notes === null || body.notes === "" ? null : body.notes;
    }

    // total_hours: undefined = skip, null/"" = write NULL
    if (body.total_hours !== undefined) {
      if (
        body.total_hours === null ||
        body.total_hours === "" ||
        (typeof body.total_hours === "number" && isNaN(body.total_hours))
      ) {
        update.total_hours = null;
      } else {
        update.total_hours = String(body.total_hours);
      }
    }

    // If check_out was cleared and total_hours wasn't explicitly set,
    // also clear total_hours.
    if (update.check_out === null && body.total_hours === undefined) {
      update.total_hours = null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No fields provided to update" },
        { status: 400 },
      );
    }

    await db.update(attendance).set(update).where(eq(attendance.id, body.id));

    // Recalc payroll
    if (
      body.check_in !== undefined ||
      body.check_out !== undefined ||
      body.total_hours !== undefined
    ) {
      const record = await db
        .select({ date: attendance.date, user_id: attendance.user_id })
        .from(attendance)
        .where(eq(attendance.id, body.id))
        .limit(1)
        .then((r) => r[0] ?? null);

      if (record) {
        const [yr, mo] =
          record.date instanceof Date
            ? [record.date.getFullYear(), record.date.getMonth() + 1]
            : (record.date as string).split("-").map(Number);
        const monthDate = new Date(Date.UTC(yr, mo - 1, 1));
        recalculateUserPayroll(record.user_id, monthDate).catch((err) =>
          console.error("[PATCH attendance] payroll recalc failed:", err),
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/attendance:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
