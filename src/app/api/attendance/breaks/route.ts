// app/api/attendance/breaks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { breakSessions, attendance } from "@/db/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { getOfficeConfig } from "@/lib/office-config";

// ─── GET: Fetch all break sessions for an attendance record ───────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const attendanceId = searchParams.get("attendance_id");

    if (!attendanceId)
      return NextResponse.json(
        { error: "attendance_id required" },
        { status: 400 },
      );

    const breaks = await db
      .select()
      .from(breakSessions)
      .where(eq(breakSessions.attendance_id, attendanceId))
      .orderBy(desc(breakSessions.break_start));

    const serialized = breaks.map((b) => ({
      ...b,
      break_start:
        b.break_start instanceof Date
          ? b.break_start.toISOString()
          : b.break_start,
      break_end:
        b.break_end instanceof Date ? b.break_end.toISOString() : b.break_end,
    }));

    return NextResponse.json({ breaks: serialized });
  } catch (err) {
    console.error("GET /api/attendance/breaks:", err);
    return NextResponse.json(
      { error: "Failed to fetch breaks" },
      { status: 500 },
    );
  }
}

// ─── POST: Create a new break session ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      attendance_id: string;
      user_id: string;
      break_start: string; // PKT naive: "14:00"
      break_end?: string | null; // PKT naive: "14:30"
      allowed_minutes: number;
    };

    if (!body.attendance_id || !body.user_id || !body.break_start)
      return NextResponse.json(
        { error: "attendance_id, user_id, and break_start are required" },
        { status: 400 },
      );

    // Verify attendance record exists
    const att = await db
      .select({
        id: attendance.id,
        user_id: attendance.user_id,
        date: attendance.date,
      })
      .from(attendance)
      .where(eq(attendance.id, body.attendance_id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!att || att.user_id !== body.user_id)
      return NextResponse.json(
        { error: "Invalid attendance record" },
        { status: 400 },
      );

    // Parse PKT times to UTC
    const dateStr =
      att.date instanceof Date
        ? att.date.toISOString().split("T")[0]
        : att.date;
    const breakStartUTC = new Date(`${dateStr}T${body.break_start}:00+05:00`);
    const breakEndUTC = body.break_end
      ? new Date(`${dateStr}T${body.break_end}:00+05:00`)
      : null;

    // Calculate actual minutes if end time provided
    let actualMinutes: number | null = null;
    if (breakEndUTC) {
      const ms = breakEndUTC.getTime() - breakStartUTC.getTime();
      actualMinutes = parseFloat((ms / 60000).toFixed(2));
    }

    const officeConf = await getOfficeConfig();
    const allowedMinutes =
      body.allowed_minutes ?? officeConf?.break_minutes_default ?? 30;
    const graceMinutes = officeConf?.break_grace_minutes ?? 5;
    const overtimeMinutes =
      actualMinutes !== null
        ? Math.max(0, actualMinutes - (allowedMinutes + graceMinutes))
        : 0;

    const id = uuid();
    await db.insert(breakSessions).values({
      id,
      attendance_id: body.attendance_id,
      user_id: body.user_id,
      break_start: breakStartUTC,
      break_end: breakEndUTC,
      actual_minutes:
        actualMinutes !== null ? String(actualMinutes.toFixed(2)) : null,
      allowed_minutes: allowedMinutes,
      overtime_minutes: String(overtimeMinutes.toFixed(2)),
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/attendance/breaks:", err);
    return NextResponse.json(
      { error: "Failed to create break" },
      { status: 500 },
    );
  }
}

// ─── PATCH: Update a break session ────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await req.json()) as {
      id: string;
      break_start?: string;
      break_end?: string | null;
      allowed_minutes?: number;
    };

    if (!body.id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await db
      .select({
        id: breakSessions.id,
        attendance_id: breakSessions.attendance_id,
        user_id: breakSessions.user_id,
        break_start: breakSessions.break_start,
        break_end: breakSessions.break_end,
        allowed_minutes: breakSessions.allowed_minutes,
      })
      .from(breakSessions)
      .where(eq(breakSessions.id, body.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!existing)
      return NextResponse.json({ error: "Break not found" }, { status: 404 });

    const att = await db
      .select({ date: attendance.date })
      .from(attendance)
      .where(eq(attendance.id, existing.attendance_id))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!att)
      return NextResponse.json(
        { error: "Attendance not found" },
        { status: 404 },
      );

    const dateStr =
      att.date instanceof Date
        ? att.date.toISOString().split("T")[0]
        : att.date;

    // 🔑 FIX: Use proper type instead of 'any'
    const update: {
      break_start?: Date;
      break_end?: Date | null;
      allowed_minutes?: number;
      actual_minutes?: string;
      overtime_minutes?: string;
    } = {};

    if (body.break_start) {
      update.break_start = new Date(`${dateStr}T${body.break_start}:00+05:00`);
    }
    if (body.break_end !== undefined) {
      update.break_end = body.break_end
        ? new Date(`${dateStr}T${body.break_end}:00+05:00`)
        : null;
    }
    if (body.allowed_minutes !== undefined) {
      update.allowed_minutes = body.allowed_minutes;
    }

    // Recalculate actual_minutes and overtime if times changed
    if (body.break_start || body.break_end !== undefined) {
      const start = update.break_start || existing.break_start;
      const end =
        update.break_end !== undefined
          ? body.break_end
            ? new Date(`${dateStr}T${body.break_end}:00+05:00`)
            : null
          : existing.break_end;

      if (start && end) {
        const ms = end.getTime() - start.getTime();
        const actualMinutes = parseFloat((ms / 60000).toFixed(2));
        update.actual_minutes = String(actualMinutes.toFixed(2));

        const officeConf = await getOfficeConfig();
        const allowed = body.allowed_minutes ?? existing.allowed_minutes;
        const grace = officeConf?.break_grace_minutes ?? 5;
        const overtime = Math.max(0, actualMinutes - (allowed + grace));
        update.overtime_minutes = String(overtime.toFixed(2));
      }
    }

    await db
      .update(breakSessions)
      .set({ ...update })
      .where(eq(breakSessions.id, body.id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("PATCH /api/attendance/breaks:", err);
    return NextResponse.json(
      { error: "Failed to update break" },
      { status: 500 },
    );
  }
}

// ─── DELETE: Remove a break session ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "ADMIN")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id)
      return NextResponse.json({ error: "id required" }, { status: 400 });

    await db.delete(breakSessions).where(eq(breakSessions.id, id));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/attendance/breaks:", err);
    return NextResponse.json(
      { error: "Failed to delete break" },
      { status: 500 },
    );
  }
}
